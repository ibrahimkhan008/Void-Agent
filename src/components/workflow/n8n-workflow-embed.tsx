"use client";

import {
  executeReviewedN8nWorkflow,
  previewN8nWorkflow,
} from "lib/n8n/browser-approval";
import type { N8nWorkflowReadOnlySummary } from "lib/n8n/workflow-summary";
import { notify } from "lib/notify";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

export default function N8nWorkflowEmbed({
  workflow,
}: {
  workflow: N8nWorkflowReadOnlySummary;
}) {
  const t = useTranslations();
  const [isRunning, setIsRunning] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const run = async () => {
    setIsRunning(true);
    try {
      const review = await previewN8nWorkflow(workflow.id);
      const approved = await notify.confirm({
        title: `Review ${review.workflowName}`,
        description: (
          <div className="space-y-2">
            <p>The run will use the workflow&apos;s saved configuration.</p>
            <ul className="list-disc pl-5">
              {review.effects.map((effect, index) => (
                <li key={`${index}-${effect}`}>{effect}</li>
              ))}
            </ul>
          </div>
        ),
        okText: "Approve and run",
      });
      if (!approved) return;
      await executeReviewedN8nWorkflow({ id: workflow.id, review, query: {} });
      toast.success("Workflow run request accepted by n8n");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Workflow.runError"),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const deactivate = async () => {
    setIsDeactivating(true);
    try {
      const response = await fetch(
        `/api/workflow/${encodeURIComponent(workflow.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
        },
      );
      if (!response.ok) throw new Error("Could not deactivate workflow");
      toast.success("Workflow deactivated");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Common.error"));
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <main className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {workflow.name}
        </h1>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          {workflow.active ? t("Workflow.active") : t("Workflow.inactive")}
        </span>
        {workflow.active && (
          <Button
            variant="outline"
            size="sm"
            onClick={deactivate}
            disabled={isDeactivating}
          >
            Deactivate
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={run}
          disabled={isRunning}
        >
          {t("Workflow.run")}
        </Button>
      </header>

      <section
        className="space-y-3 rounded-lg border p-4"
        aria-labelledby="workflow-steps"
      >
        <div>
          <h2 id="workflow-steps" className="font-medium">
            Workflow steps
          </h2>
          {workflow.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {workflow.description}
            </p>
          )}
        </div>
        {workflow.nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This workflow has no configured steps.
          </p>
        ) : (
          <ol className="space-y-2">
            {workflow.nodes.map((node, index) => (
              <li
                key={`${index}-${node.name}`}
                className="rounded-md bg-muted/50 p-3"
              >
                <span className="mr-2 text-xs text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="font-medium">{node.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {node.type}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">
          Workflow definitions are read-only here. Every run must be reviewed
          and approved.
        </p>
      </section>
    </main>
  );
}
