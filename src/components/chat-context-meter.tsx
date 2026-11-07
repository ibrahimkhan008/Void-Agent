"use client";

import type { LanguageModelUsage } from "ai";
import type { ChatModel } from "app-types/chat";
import {
  formatContextTokenCount,
  getContextUsagePercent,
  getContextUsageTokens,
} from "lib/ai/model-context-windows";
import { cn } from "lib/utils";
import { CircleHelp } from "lucide-react";
import React from "react";
import { Button } from "ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";

export function ChatContextMeter({
  usage,
  model,
  maxTokens,
  className,
}: {
  usage?: LanguageModelUsage;
  model?: ChatModel;
  maxTokens?: number;
  className?: string;
}) {
  const usedTokens = getContextUsageTokens(usage);

  // Old turns, provider errors, and custom models without known context sizes
  // deliberately produce no meter instead of a misleading estimate.
  if (!usage || !model || !maxTokens || usedTokens === undefined) return null;

  const percent = getContextUsagePercent(usedTokens, maxTokens);
  const modelLabel = `${model.provider}/${model.model}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 rounded-full p-0 text-muted-foreground",
            className,
          )}
          aria-label={`Approximate context usage ${percent}% for ${modelLabel}`}
          data-testid="chat-context-meter-trigger"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              strokeWidth="3"
              className="stroke-muted-foreground/20"
            />
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              strokeWidth="3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 56.55} 56.55`}
              transform="rotate(-90 12 12)"
              className={percent >= 90 ? "text-destructive" : undefined}
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Approx. context usage</span>
          <span className="font-mono text-xs text-muted-foreground">
            ~{percent}%
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Approximate context window usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className={cn(
              "h-full rounded-full bg-primary",
              percent >= 90 && "bg-destructive",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 space-y-1.5">
          <UsageRow label="Input" value={usage.inputTokens} />
          <UsageRow label="Output" value={usage.outputTokens} />
          <UsageRow label="Reasoning" value={usage.reasoningTokens} />
          <UsageRow label="Cached input" value={usage.cachedInputTokens} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span className="truncate">{modelLabel}</span>
          <span className="shrink-0">
            {formatContextTokenCount(usedTokens)} /{" "}
            {formatContextTokenCount(maxTokens)}
          </span>
        </div>
        <p className="mt-2 flex gap-1 text-[11px] text-muted-foreground">
          <CircleHelp className="size-3 shrink-0" aria-hidden="true" />
          Approximation from the latest completed response usage.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UsageRow({ label, value }: { label: string; value?: number }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between rounded bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value.toLocaleString()}</span>
    </div>
  );
}
