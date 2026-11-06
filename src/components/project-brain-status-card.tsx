"use client";

import { fetcher } from "lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";

type StatusSnapshot = {
  id: string;
  health: "green" | "yellow" | "red" | "unknown";
  progressPct: number | null;
  summary: string;
  blockers: string[];
  createdAt: string;
};

export function ProjectBrainStatusCard({
  projectId,
  canReview,
}: {
  projectId: string;
  canReview: boolean;
}) {
  const { data, mutate } = useSWR<{ snapshot: StatusSnapshot | null }>(
    `/api/projects/${projectId}/brain/status`,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 0 },
  );
  const [generating, setGenerating] = useState(false);
  const snapshot = data?.snapshot;

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/brain/status`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        snapshot?: StatusSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot)
        throw new Error(payload.error ?? "Could not summarize project status");
      await mutate({ snapshot: payload.snapshot }, { revalidate: false });
      toast.success("Project status updated from current accepted evidence");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update project status",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="mb-5 rounded-md border p-3" aria-label="Project status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Project status</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A read-only summary of accepted facts and accepted task proposals
            from currently visible source revisions.
          </p>
        </div>
        {canReview && (
          <Button
            size="sm"
            variant="outline"
            disabled={generating}
            onClick={() => void generate()}
          >
            {generating
              ? "Summarizing…"
              : snapshot
                ? "Refresh status"
                : "Summarize project"}
          </Button>
        )}
      </div>
      {snapshot ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium capitalize">{snapshot.health}</span>
            {snapshot.progressPct !== null && (
              <span className="text-muted-foreground">
                {snapshot.progressPct}% estimated progress
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Updated {new Date(snapshot.createdAt).toLocaleString()}
            </span>
          </div>
          {snapshot.progressPct !== null && (
            <progress
              className="h-2 w-full accent-primary"
              max={100}
              value={snapshot.progressPct}
              aria-label={`Estimated progress ${snapshot.progressPct}%`}
            />
          )}
          {snapshot.summary && <p className="text-sm">{snapshot.summary}</p>}
          {snapshot.blockers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium">Reported blockers</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {snapshot.blockers.map((blocker, index) => (
                  <li key={`${index}:${blocker}`}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No summary exists for the current evidence. Changing a source revision
          hides summaries produced from older evidence.
        </p>
      )}
    </section>
  );
}
