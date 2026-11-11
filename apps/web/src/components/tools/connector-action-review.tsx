"use client";

import { useState } from "react";
import type { ConnectorActionApproval } from "lib/ai/tools/hitl/connector-action-approval";

type Outcome = {
  approved: boolean;
  rejected?: boolean;
  approvalToken?: string;
  provider?: string;
  action?: string;
  payload?: unknown;
};

export function ConnectorActionReview({
  proposal,
  outcome,
  onResolve,
  readOnly = false,
}: {
  proposal: ConnectorActionApproval;
  outcome?: Outcome;
  onResolve?: (outcome: Outcome) => void;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settled = outcome !== undefined;

  const resolve = async (approved: boolean) => {
    if (busy || settled || readOnly) return;
    setError("");
    if (!approved) {
      onResolve?.({ approved: false, rejected: true });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/approvals/connector-action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
      });
      if (!response.ok)
        throw new Error(
          "Could not prepare this approval. Review and try again.",
        );
      const body = await response.json();
      if (typeof body.approvalToken !== "string")
        throw new Error("Could not prepare this approval.");
      onResolve?.({
        approved: true,
        provider: proposal.provider,
        action: proposal.action,
        payload: proposal.payload,
        approvalToken: body.approvalToken,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare this approval.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="w-full max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
      aria-label="Connector action approval"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Review external action</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {proposal.provider} · {proposal.action}. Nothing is sent until you
            approve.
          </p>
        </div>
        <span className="rounded border px-2 py-1 text-xs">
          {settled
            ? outcome.approved
              ? "Approved"
              : "Rejected"
            : "Approval required"}
        </span>
      </header>
      <pre
        className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-3 text-xs"
        aria-label="Exact action payload"
      >
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!settled && !readOnly ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve(false)}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve(true)}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Approve exact action"}
          </button>
        </div>
      ) : outcome?.approved ? (
        <p className="mt-3 text-sm text-muted-foreground">
          One-use approval issued. The action still must match this exact
          payload.
        </p>
      ) : null}
    </section>
  );
}
