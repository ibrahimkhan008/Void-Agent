"use client";

import { fetcher } from "lib/utils";
import { Check, X } from "lucide-react";
import Link from "next/link";
import React from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";

type TimelineEvent = {
  id: string;
  summary: string;
  detail: string | null;
  evidence: string;
  eventDate: string | null;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
  sourceItemId: string;
  filename: string | null;
  collectionId: string;
};

type TimelineResponse = { events: TimelineEvent[] };

export function ProjectBrainTimeline({
  projectId,
  canReview,
}: {
  projectId: string;
  canReview: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<TimelineResponse>(
    `/api/projects/${projectId}/brain/timeline`,
    fetcher,
  );

  const review = async (eventId: string, status: "accepted" | "rejected") => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/timeline/${eventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not review timeline event");
      }
      await mutate();
      toast.success(
        status === "accepted"
          ? "Timeline event accepted"
          : "Timeline event dismissed",
      );
    } catch (reviewError) {
      toast.error(
        reviewError instanceof Error
          ? reviewError.message
          : "Could not review timeline event",
      );
    }
  };

  return (
    <section
      className="mb-5 rounded-md border p-3"
      aria-label="Project timeline"
    >
      <h3 className="font-medium">Project timeline</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Events are proposed from source documents. Editors review them before
        they appear as accepted project history.
      </p>
      {isLoading && (
        <p className="mt-3 text-sm text-muted-foreground">Loading timeline…</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive">
          Timeline could not be loaded.
        </p>
      )}
      {!isLoading && !error && (data?.events.length ?? 0) === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No source-backed timeline events yet.
        </p>
      )}
      <ol className="mt-3 space-y-2">
        {data?.events.map((event) => (
          <li key={event.id} className="rounded border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="font-medium">{event.summary}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.eventDate
                    ? new Date(
                        `${event.eventDate}T00:00:00`,
                      ).toLocaleDateString()
                    : "Date not established by source"}
                  {` · ${event.filename || "Source"}`}
                  {event.collectionId && (
                    <>
                      {" · "}
                      <Link
                        href={`/knowledge/${event.collectionId}`}
                        className="underline"
                      >
                        Open source
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {event.status}
              </span>
            </div>
            {event.detail && <p className="mt-2">{event.detail}</p>}
            <blockquote className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
              {event.evidence}
            </blockquote>
            {canReview && event.status === "proposed" && (
              <div className="mt-2 flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Accept event: ${event.summary}`}
                  onClick={() => void review(event.id, "accepted")}
                >
                  <Check className="size-4" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Dismiss event: ${event.summary}`}
                  onClick={() => void review(event.id, "rejected")}
                >
                  <X className="size-4" /> Dismiss
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
