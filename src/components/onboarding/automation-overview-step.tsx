"use client";

import { ArrowRight, Bot, Workflow } from "lucide-react";
import React from "react";
import { Button } from "ui/button";

export function AutomationOverviewStep({
  onContinue,
  onSkip,
  onChoose,
}: {
  onContinue: () => void;
  onSkip: () => void;
  onChoose: (path: "/agents" | "/workflow") => void;
}) {
  return (
    <section className="w-full max-w-3xl" aria-labelledby="onboarding-title">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-primary">VOID-AGENT</p>
        <h1 id="onboarding-title" className="mt-2 text-3xl font-semibold">
          What would you like to automate first?
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start with a ready-made agent or build a workflow for a repeatable
          task.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="flex flex-col rounded-xl border bg-card p-6">
          <Bot className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Use an agent</h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Browse agents that can research, write, and help with everyday
            tasks.
          </p>
          <Button className="mt-5" onClick={() => onChoose("/agents")}>
            Browse agents <ArrowRight className="ml-2 size-4" />
          </Button>
        </article>

        <article className="flex flex-col rounded-xl border bg-card p-6">
          <Workflow className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Build a workflow</h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            Create a repeatable process and connect it to the tools you use.
          </p>
          <Button className="mt-5" onClick={() => onChoose("/workflow")}>
            Open workflows <ArrowRight className="ml-2 size-4" />
          </Button>
        </article>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="ghost" onClick={onSkip}>
          Skip setup
        </Button>
        <Button variant="outline" onClick={onContinue}>
          Connect apps <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </section>
  );
}
