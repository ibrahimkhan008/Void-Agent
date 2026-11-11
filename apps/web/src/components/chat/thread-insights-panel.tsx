"use client";

import type { StoredThreadInsights } from "app-types/thread-insights";
import { Loader, RefreshCw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "ui/sheet";

type InsightsData = StoredThreadInsights;

export function ThreadInsightsPanel({
  threadId,
  initial,
}: {
  threadId: string;
  initial: InsightsData | null;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InsightsData | null>(initial);
  const [pending, startTransition] = useTransition();

  const hasInsights =
    data !== null &&
    (data.summary.length > 0 ||
      data.decisions.length > 0 ||
      data.actionItems.length > 0);
  const isStale =
    hasInsights &&
    (data.sourceMessageCount !== data.currentMessageCount ||
      data.sourceLastMessageId !== data.currentLastMessageId);

  const generate = () => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/thread/${encodeURIComponent(threadId)}/insights`,
          { method: "POST" },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error || `Request failed (${response.status})`,
          );
        }
        const result = (await response.json()) as {
          summary?: string;
          decisions?: string[];
          actionItems?: string[];
          insightsGeneratedAt?: string | null;
          sourceMessageCount?: number;
          sourceLastMessageId?: string | null;
          currentMessageCount?: number;
          currentLastMessageId?: string | null;
        };
        setData({
          summary: result.summary ?? "",
          decisions: result.decisions ?? [],
          actionItems: result.actionItems ?? [],
          generatedAt: result.insightsGeneratedAt ?? null,
          sourceMessageCount: result.sourceMessageCount ?? 0,
          sourceLastMessageId: result.sourceLastMessageId ?? null,
          currentMessageCount: result.currentMessageCount ?? 0,
          currentLastMessageId: result.currentLastMessageId ?? null,
        });
        toast.success("Thread insights generated");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Insights generation failed",
        );
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3 text-xs"
          data-testid="thread-insights-trigger"
        >
          <Sparkles className="size-3" />
          {isStale
            ? "Stale insights · refresh"
            : hasInsights
              ? "Insights"
              : "Generate insights"}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="thread-insights-panel"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Thread insights
          </SheetTitle>
          <SheetDescription>
            {isStale
              ? "This conversation changed since these insights were generated. Refresh to update them."
              : hasInsights && data.generatedAt
                ? `Generated ${formatTimestamp(data.generatedAt)}`
                : "Summarize this conversation, its decisions, and next actions."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-8">
          {!hasInsights && !pending && (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No insights yet. Generation only uses this conversation.
              </p>
              <Button
                type="button"
                onClick={generate}
                className="mt-4 gap-2"
                data-testid="thread-insights-generate"
              >
                <Sparkles className="size-3.5" />
                Generate insights
              </Button>
            </div>
          )}

          {pending && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground"
            >
              <Loader className="size-4 animate-spin" />
              Generating insights…
            </div>
          )}

          {hasInsights && data && !pending && (
            <>
              {isStale && (
                <div
                  role="status"
                  data-testid="thread-insights-stale-notice"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
                >
                  These insights are out of date because the conversation has
                  changed. Refresh them before relying on this summary.
                </div>
              )}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Summary
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {data.summary}
                </p>
              </section>

              {data.decisions.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Decisions ({data.decisions.length})
                  </h3>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {data.decisions.map((decision, index) => (
                      <li
                        key={`${index}-${decision}`}
                        className="flex gap-2 leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.actionItems.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Action items ({data.actionItems.length})
                  </h3>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {data.actionItems.map((item, index) => (
                      <li
                        key={`${index}-${item}`}
                        className="flex gap-2 leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.sourceMessageCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Based on {data.sourceMessageCount} messages.
                </p>
              )}
              <div className="border-t border-border/60 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  className="gap-1.5"
                  data-testid="thread-insights-refresh"
                >
                  <RefreshCw className="size-3" />
                  Refresh insights
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleString();
}
