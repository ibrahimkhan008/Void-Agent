"use client";

import { Loader2, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { Button } from "ui/button";

export type VoiceCaptureSummary = {
  title: string;
  summary: string;
  actionItems: { text: string; owner: string | null; dueDate: string | null }[];
  decisions: string[];
  notes: string[];
};

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Use the generic UI error if the server returned a non-JSON response.
  }
  return "Could not summarize this capture.";
}

export function VoiceCaptureSummaryPanelView({
  summary,
  busy,
  error,
  onSummarize,
}: {
  summary: VoiceCaptureSummary | null;
  busy: boolean;
  error: string | null;
  onSummarize: () => void;
}) {
  return (
    <section
      className="mt-3 rounded-md border bg-background p-3"
      aria-label="Capture summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">Capture summary</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated only when requested. The summary is not saved, sent, or
            executed.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSummarize}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {busy
            ? "Summarizing…"
            : summary
              ? "Regenerate summary"
              : "Summarize transcript"}
        </Button>
      </div>
      {busy && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Summarizing this transcript…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {summary && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <h5 className="font-medium">{summary.title}</h5>
            <p className="mt-1 whitespace-pre-wrap">{summary.summary}</p>
          </div>
          {summary.actionItems.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">
                Action items · text only
              </h5>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {summary.actionItems.map((item, index) => (
                  <li key={`${index}-${item.text}`}>
                    {item.text}
                    {(item.owner || item.dueDate) && (
                      <span className="text-muted-foreground">
                        {item.owner ? ` — ${item.owner}` : ""}
                        {item.dueDate ? ` · ${item.dueDate}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.decisions.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">
                Decisions
              </h5>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {summary.decisions.map((decision, index) => (
                  <li key={`${index}-${decision}`}>{decision}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.notes.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">
                Notes
              </h5>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {summary.notes.map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function VoiceCaptureSummaryPanel({
  deviceId,
  sessionId,
}: {
  deviceId: string;
  sessionId: string;
}) {
  const [summary, setSummary] = useState<VoiceCaptureSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summarize = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/voice/devices/${encodeURIComponent(deviceId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        summary: VoiceCaptureSummary;
      };
      setSummary(result.summary);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not summarize this capture.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <VoiceCaptureSummaryPanelView
      summary={summary}
      busy={busy}
      error={error}
      onSummarize={() => void summarize()}
    />
  );
}
