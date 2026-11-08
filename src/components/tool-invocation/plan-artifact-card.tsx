"use client";

import type { ToolUIPart } from "ai";
import { ListTodo } from "lucide-react";
import React from "react";

type PlanStep = { title?: unknown; description?: unknown };
type PlanInput = {
  title?: unknown;
  description?: unknown;
  steps?: unknown;
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function PlanArtifactCard({ part }: { part: ToolUIPart }) {
  const input = (part.input ?? {}) as PlanInput;
  const title = text(input.title, 160) || "Plan";
  const description = text(input.description, 1_200);
  const steps = Array.isArray(input.steps)
    ? (input.steps as PlanStep[]).slice(0, 12)
    : [];
  const isReady = part.state === "output-available";

  return (
    <section
      className="my-3 max-w-2xl rounded-xl border bg-card p-4 shadow-sm"
      aria-label="Plan artifact"
      data-testid="plan-artifact-card"
    >
      <header className="mb-3 flex items-center gap-2">
        <ListTodo aria-hidden="true" className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {isReady ? "Plan ready · no actions executed" : "Preparing plan"}
          </p>
        </div>
      </header>
      {description ? (
        <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {steps.length ? (
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const stepTitle = text(step?.title, 180);
            if (!stepTitle) return null;
            const stepDescription = text(step?.description, 800);
            return (
              <li key={`${index}-${stepTitle}`} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{stepTitle}</p>
                  {stepDescription ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                      {stepDescription}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
