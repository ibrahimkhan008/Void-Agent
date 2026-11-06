"use client";

import type { ToolUIPart } from "ai";
import {
  type TabularReviewStreamEvent,
  readTabularReviewStream,
} from "lib/tabular/review-stream";
import { toAny } from "lib/utils";
import { TableProperties } from "lucide-react";
import Link from "next/link";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";

type Column = { id: string; label: string; type: string; prompt?: string };
type Cell = {
  itemId: string;
  columnId: string;
  value: string | null;
  status: "pending" | "generating" | "done" | "error";
};
type ReviewData = {
  review: {
    id: string;
    title: string;
    status: "pending" | "generating" | "done" | "error";
    columns: Column[];
  };
  items: Array<{ itemId: string; rowIndex: number; filename: string | null }>;
  cells: Cell[];
};

export function shouldAutoGenerateReview(
  status: ReviewData["review"]["status"],
) {
  return status === "pending" || status === "error";
}

function isReviewId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function TabularReviewToolCard({ part }: { part: ToolUIPart }) {
  const input = toAny(part.input) as {
    title?: string;
    itemIds?: string[];
    columns?: Column[];
  } | null;
  const output = toAny(part.output) as {
    id?: string;
    title?: string;
    error?: string;
    documentCount?: number;
    columnCount?: number;
  } | null;
  const title = output?.title || input?.title || "Document comparison";
  const error = part.state === "output-error" ? part.errorText : output?.error;
  const isPending = !part.state.startsWith("output");
  const reviewId = isReviewId(output?.id) ? output.id : undefined;
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const started = useRef(false);
  const activeReviewId = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeReviewId.current = reviewId;
    if (!reviewId || error || isPending || started.current) {
      return () => {
        activeReviewId.current = undefined;
      };
    }
    started.current = true;

    const refresh = async () => {
      const response = await fetch(`/api/tabular-reviews/${reviewId}`);
      if (!response.ok) throw new Error("Could not load the review");
      const next = (await response.json()) as ReviewData;
      if (activeReviewId.current === reviewId) setData(next);
      return next;
    };

    const generate = async () => {
      if (activeReviewId.current === reviewId) setGenerating(true);
      try {
        const response = await fetch(
          `/api/tabular-reviews/${reviewId}/generate`,
          { method: "POST" },
        );
        if (response.status === 409) {
          // Another open review page may own the generation stream. Follow the
          // persisted state instead of starting a second model run.
          for (let attempt = 0; attempt < 150; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 2_000));
            const current = await refresh();
            if (current.review.status !== "generating") return;
          }
          throw new Error(
            "Review generation is still running; open the review to check its status.",
          );
        }
        if (!response.ok || !response.body)
          throw new Error("Generation could not start");

        await readTabularReviewStream(
          response.body,
          (event: TabularReviewStreamEvent) => {
            if (activeReviewId.current !== reviewId) return;
            if (event.type === "cell") {
              setData((current) =>
                current
                  ? {
                      ...current,
                      cells: current.cells.map((cell) =>
                        cell.itemId === event.itemId &&
                        cell.columnId === event.columnId
                          ? {
                              ...cell,
                              value: event.value,
                              status: event.status,
                            }
                          : cell,
                      ),
                    }
                  : current,
              );
            } else if (event.type === "error") {
              toast.error(event.message || "Review generation failed");
            }
          },
        );
        await refresh();
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Review generation failed",
        );
        await refresh().catch(() => undefined);
      } finally {
        if (activeReviewId.current === reviewId) setGenerating(false);
      }
    };

    const followExistingGeneration = async () => {
      if (activeReviewId.current === reviewId) setGenerating(true);
      try {
        for (let attempt = 0; attempt < 150; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
          const current = await refresh();
          if (current.review.status !== "generating") return;
        }
        toast.error(
          "Review generation is still running; open the review to check its status.",
        );
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Could not refresh review",
        );
      } finally {
        if (activeReviewId.current === reviewId) setGenerating(false);
      }
    };

    if (activeReviewId.current === reviewId) setLoading(true);
    void refresh()
      .then((current) => {
        if (shouldAutoGenerateReview(current.review.status)) {
          void generate();
        } else if (current.review.status === "generating") {
          void followExistingGeneration();
        }
      })
      .catch((cause) => {
        toast.error(
          cause instanceof Error ? cause.message : "Could not load review",
        );
      })
      .finally(() => {
        if (activeReviewId.current === reviewId) setLoading(false);
      });

    return () => {
      if (activeReviewId.current === reviewId)
        activeReviewId.current = undefined;
    };
  }, [error, isPending, reviewId]);

  const status = generating ? "Generating" : data?.review.status;
  const cellMap = new Map(
    (data?.cells ?? []).map((cell) => [
      `${cell.itemId}:${cell.columnId}`,
      cell,
    ]),
  );

  return (
    <section className="mx-6 my-3 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <TableProperties className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {error ||
              (isPending
                ? `Preparing ${input?.itemIds?.length ?? 0} documents × ${input?.columns?.length ?? 0} fields…`
                : data
                  ? `${data.items.length} documents · ${data.review.columns.length} fields`
                  : `${output?.documentCount ?? 0} documents · ${output?.columnCount ?? 0} fields`)}
          </div>
        </div>
        {error ? (
          <Badge variant="destructive">Failed</Badge>
        ) : isPending ? (
          <Badge variant="secondary">Preparing</Badge>
        ) : status ? (
          <Badge variant={status === "done" ? "default" : "secondary"}>
            {status}
          </Badge>
        ) : null}
        {!isPending && reviewId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/tabular-reviews/${reviewId}`}>Review &amp; edit</Link>
          </Button>
        )}
        {!isPending && reviewId && status === "done" && (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/tabular-reviews/${reviewId}/export`}>Export</a>
          </Button>
        )}
      </div>
      {isPending && (
        <div className="px-4 pb-4">
          <Badge variant="secondary">Preparing</Badge>
        </div>
      )}
      {!isPending && !error && (loading || !data) && (
        <div className="px-4 pb-4 text-sm text-muted-foreground">
          Loading saved review…
        </div>
      )}
      {!isPending && !error && data && (
        <div className="max-h-80 overflow-auto border-t">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-muted/70 text-left">
                <th className="min-w-40 border-b p-3">Document</th>
                {data.review.columns.map((column) => (
                  <th key={column.id} className="min-w-44 border-b p-3">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.itemId} className="align-top">
                  <th className="max-w-48 border-b p-3 text-left font-medium">
                    {item.filename || "Untitled source"}
                  </th>
                  {data.review.columns.map((column) => {
                    const cell = cellMap.get(`${item.itemId}:${column.id}`);
                    const runActive =
                      generating || data.review.status === "generating";
                    return (
                      <td
                        key={column.id}
                        className="whitespace-pre-wrap border-b p-3 text-muted-foreground"
                      >
                        {cell?.status === "generating" ||
                        (runActive && cell?.status === "pending")
                          ? "Generating…"
                          : cell?.value ||
                            (cell?.status === "error"
                              ? "Generation failed; open the review to retry."
                              : "—")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
