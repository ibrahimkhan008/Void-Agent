"use client";

import { formatDistanceToNow } from "date-fns";
import { fetcher } from "lib/utils";
import { AlertTriangle, History, Loader2, Play, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import useSWR from "swr";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

type ExecutionSummary = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  completedNodeCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  expired: boolean;
};

type EffectReview = {
  nodeId: string;
  kind: "llm" | "http" | "tool";
  target: string;
  payload: Record<string, unknown>;
  hash: string;
};

type ExecutionDetail = ExecutionSummary & {
  pendingEffect: EffectReview | null;
  canApprove: boolean;
  canReject: boolean;
};

type HistoryResponse = { executions: ExecutionSummary[] };

const statusLabel: Record<string, string> = {
  running: "Running",
  awaiting_approval: "Needs review",
  effect_uncertain: "Effect needs manual check",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function WorkflowExecutionHistory() {
  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    "/api/workflow/executions",
    fetcher,
    {
      refreshInterval: 15_000,
    },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openDetails = async (executionId: string) => {
    setSelectedId(executionId);
    setLoadingDetail(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/workflow/executions/${encodeURIComponent(executionId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as
        | { execution: ExecutionDetail }
        | { error?: string };
      if (!response.ok || !("execution" in body)) {
        throw new Error("Could not load this workflow execution.");
      }
      setDetail(body.execution);
    } catch {
      setDetail(null);
      setMessage("Could not load this workflow execution.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!detail?.pendingEffect) return;
    setDecisionBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/workflow/executions/${encodeURIComponent(detail.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            effectHash: detail.pendingEffect.hash,
          }),
        },
      );
      const body = (await response.json()) as { status?: string };
      if (!response.ok) {
        throw new Error(
          "The workflow changed. Reload its current state to review it.",
        );
      }
      await mutate();
      await openDetails(detail.id);
      if (body.status === "success") {
        setMessage("Workflow completed.");
      } else if (body.status === "cancelled") {
        setMessage("Workflow action rejected and execution cancelled.");
      } else if (body.status === "awaiting_approval") {
        setMessage("The next workflow action needs your review.");
      } else if (body.status === "effect_uncertain") {
        setMessage(
          "The workflow paused because an effect needs manual verification.",
        );
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not process this workflow decision.",
      );
    } finally {
      setDecisionBusy(false);
    }
  };

  const executions = data?.executions ?? [];

  return (
    <Card className="bg-secondary/40">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Workflow execution history
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect recent runs and resume an action only after reviewing its
            exact request.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void mutate()}
          aria-label="Refresh workflow execution history"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading executions…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Workflow execution history is unavailable.
          </p>
        ) : executions.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No workflow executions yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {executions.map((execution) => (
              <li
                key={execution.id}
                className="flex flex-wrap items-center gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {execution.workflowName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel[execution.status] ?? "Status unavailable"} ·{" "}
                    {execution.completedNodeCount} completed node(s) · updated{" "}
                    {formatDistanceToNow(new Date(execution.updatedAt), {
                      addSuffix: true,
                    })}
                    {execution.expired ? " · approval expired" : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openDetails(execution.id)}
                  disabled={loadingDetail && selectedId === execution.id}
                >
                  {loadingDetail && selectedId === execution.id ? (
                    <Loader2 className="mr-2 size-3 animate-spin" />
                  ) : null}
                  {execution.status === "awaiting_approval" &&
                  !execution.expired
                    ? "Review action"
                    : "Inspect run"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {loadingDetail && selectedId ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading run details…
          </p>
        ) : null}

        {detail ? (
          <section
            aria-label="Selected workflow execution details"
            className="space-y-3 rounded-md border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{detail.workflowName}</h3>
                <p className="text-xs text-muted-foreground">
                  {statusLabel[detail.status] ?? "Status unavailable"} ·{" "}
                  {detail.completedNodeCount} completed node(s)
                </p>
              </div>
              {detail.status === "effect_uncertain" ? (
                <AlertTriangle
                  className="size-4 text-amber-500"
                  aria-label="Effect outcome uncertain"
                />
              ) : null}
            </div>

            {detail.pendingEffect ? (
              <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/5 p-3">
                <div>
                  <p className="text-sm font-semibold">
                    Review exact workflow action
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {detail.pendingEffect.kind} · {detail.pendingEffect.target}
                  </p>
                </div>
                <pre className="max-h-64 overflow-auto rounded border bg-background p-2 text-xs">
                  {JSON.stringify(detail.pendingEffect.payload, null, 2)}
                </pre>
                {detail.expired ? (
                  <p className="text-xs text-muted-foreground">
                    This approval expired. Start a new workflow run to continue.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decide("approve")}
                      disabled={!detail.canApprove || decisionBusy}
                    >
                      {decisionBusy ? (
                        <Loader2 className="mr-2 size-3 animate-spin" />
                      ) : (
                        <Play className="mr-2 size-3" />
                      )}
                      Approve and resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decide("reject")}
                      disabled={!detail.canReject || decisionBusy}
                    >
                      Reject and stop
                    </Button>
                  </div>
                )}
                {!detail.canApprove && !detail.expired ? (
                  <p className="text-xs text-muted-foreground">
                    Current workflow or connector access no longer permits
                    resuming this run. You can reject it.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
