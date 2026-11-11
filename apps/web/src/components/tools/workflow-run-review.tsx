"use client";

import type { SavedWorkflowRunProposal } from "@/lib/ai/tools/hitl/workflow-run-approval";
import { AlertCircle, CheckCircle2, Workflow, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";
import JsonView from "ui/json-view";

type WorkflowReview = {
  graphRevision: string;
  effects: string[];
  issues: string[];
  reviewable: boolean;
};

type WorkflowRunApprovalOutcome =
  | { approved: true; approvalToken: string; graphRevision: string }
  | { approved: false; rejected: true };

export function WorkflowRunReview({
  proposal,
  outcome,
  onResolve,
  readOnly = false,
}: {
  proposal: SavedWorkflowRunProposal;
  outcome?: WorkflowRunApprovalOutcome;
  onResolve?: (result: WorkflowRunApprovalOutcome) => void;
  readOnly?: boolean;
}) {
  const [review, setReview] = useState<WorkflowReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (outcome || resolved || readOnly) return;
    const controller = new AbortController();
    setReview(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/approvals/workflow-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            previewWorkflowId: proposal.target,
            workflowName: proposal.workflowName,
          }),
        });
        const value = (await response.json()) as WorkflowReview & {
          error?: string;
        };
        if (!response.ok) throw new Error(value.error || "Review unavailable");
        if (
          typeof value.graphRevision !== "string" ||
          !Array.isArray(value.effects) ||
          !Array.isArray(value.issues) ||
          typeof value.reviewable !== "boolean"
        ) {
          throw new Error("The workflow review response was invalid.");
        }
        setReview(value);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "Review unavailable",
          );
        }
      }
    })();
    return () => controller.abort();
  }, [proposal.target, proposal.workflowName, outcome, resolved, readOnly]);

  const reject = () => {
    setResolved(true);
    onResolve?.({ approved: false, rejected: true });
  };

  const approve = async () => {
    if (!review?.reviewable || !onResolve || busy || resolved) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/approvals/workflow-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...proposal,
          graphRevision: review.graphRevision,
        }),
      });
      const value = (await response.json()) as {
        approvalToken?: string;
        error?: string;
      };
      if (!response.ok || typeof value.approvalToken !== "string") {
        throw new Error(value.error || "Could not approve this workflow run.");
      }
      setResolved(true);
      onResolve({
        approved: true,
        approvalToken: value.approvalToken,
        graphRevision: review.graphRevision,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not approve this workflow run.",
      );
    } finally {
      setBusy(false);
    }
  };

  const settledOutcome = outcome ?? (resolved ? { approved: false } : null);

  return (
    <section
      aria-label={`Review workflow run: ${proposal.workflowName}`}
      className="my-3 space-y-3 rounded-lg border bg-background p-4 shadow-sm"
    >
      <header className="flex items-center gap-2 border-b pb-3 text-sm font-semibold">
        <Workflow className="size-4" aria-hidden="true" />
        <span>Review workflow run</span>
        {settledOutcome && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            {settledOutcome.approved ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-muted-foreground" />
            )}
            {settledOutcome.approved ? "Approved" : "Rejected"}
          </span>
        )}
      </header>

      <div className="space-y-1 text-sm">
        <p className="font-medium">{proposal.workflowName}</p>
        <p className="text-xs text-muted-foreground">
          Workflow ID: {proposal.target}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Exact input
        </h3>
        <div className="max-h-56 overflow-auto rounded-md border p-2 text-xs">
          <JsonView data={proposal.payload} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          External effects
        </h3>
        {review ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {review.effects.map((effect, index) => (
              <li key={`${index}-${effect}`}>{effect}</li>
            ))}
          </ul>
        ) : readOnly ? (
          <p className="text-sm text-muted-foreground">
            This shared transcript is read-only; no workflow review is
            requested.
          </p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Unable to review</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Loading the current workflow definition…
          </p>
        )}
        {review?.issues.map((issue) => (
          <p key={issue} className="text-sm text-destructive">
            {issue}
          </p>
        ))}
        {review &&
          review.effects.length === 0 &&
          review.issues.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No external effects detected.
            </p>
          )}
      </div>

      {error && review && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!readOnly && !outcome && !resolved && onResolve && (
        <footer className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={reject} disabled={busy}>
            Reject
          </Button>
          <Button
            onClick={() => void approve()}
            disabled={busy || !review?.reviewable}
          >
            {busy ? "Approving…" : "Approve exact run"}
          </Button>
        </footer>
      )}
      {outcome?.approved && (
        <p className="text-sm text-muted-foreground">
          The one-use approval is bound to this workflow revision and exact
          input.
        </p>
      )}
    </section>
  );
}
