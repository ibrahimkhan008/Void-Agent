"use client";

import { formatDistanceToNow } from "date-fns";
import {
  executeReviewedN8nWorkflow,
  previewN8nWorkflow,
} from "lib/n8n/browser-approval";
import type { N8nWorkflowListSummary } from "lib/n8n/workflow-summary";
import { notify } from "lib/notify";
import { fetcher } from "lib/utils";
import { Play, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { Button } from "ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { Skeleton } from "ui/skeleton";

export function N8nWorkflowList() {
  const t = useTranslations();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: workflows = [], isLoading } = useSWR<N8nWorkflowListSummary[]>(
    "/api/n8n/workflows",
    fetcher,
    { fallbackData: [] },
  );

  const runWorkflow = async (id: string) => {
    setBusyId(id);
    try {
      const review = await previewN8nWorkflow(id);
      const approved = await notify.confirm({
        title: `Review ${review.workflowName}`,
        description: (
          <div className="space-y-2">
            <p>The run uses the saved workflow configuration.</p>
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
      await executeReviewedN8nWorkflow({ id, review, query: {} });
      toast.success("Workflow run request accepted by n8n");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Workflow.runError"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const deleteWorkflow = async (id: string) => {
    const approved = await notify.confirm({
      description: t("Workflow.deleteConfirm"),
    });
    if (!approved) return;
    setBusyId(id);
    try {
      const response = await fetch(
        `/api/n8n/workflows/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Could not delete workflow");
      await mutate("/api/n8n/workflows");
      toast.success(t("Workflow.deleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Common.error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="flex w-full flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold">n8n workflows</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-[176px] w-full" />
            ))
          : workflows.map((workflow) => (
              <Card
                key={workflow.id}
                className="group relative h-[176px] w-full cursor-pointer overflow-hidden bg-secondary transition-colors hover:bg-input"
                onClick={() =>
                  router.push(
                    `/n8n/workflow/${encodeURIComponent(workflow.id)}`,
                  )
                }
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <WorkflowIcon className="size-4 text-muted-foreground" />
                    <CardTitle className="flex-1 truncate text-base">
                      {workflow.name}
                    </CardTitle>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        workflow.active
                          ? "bg-green-500/15 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {workflow.active
                        ? t("Workflow.active")
                        : t("Workflow.inactive")}
                    </span>
                  </div>
                  {workflow.description && (
                    <CardDescription className="line-clamp-2">
                      {workflow.description}
                    </CardDescription>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">
                      {workflow.updatedAt
                        ? formatDistanceToNow(new Date(workflow.updatedAt), {
                            addSuffix: true,
                          })
                        : ""}
                    </span>
                    <div
                      className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Workflow.run")}
                        disabled={busyId === workflow.id}
                        onClick={() => runWorkflow(workflow.id)}
                      >
                        <Play className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Workflow.delete")}
                        disabled={busyId === workflow.id}
                        onClick={() => deleteWorkflow(workflow.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
      </div>
      {!isLoading && workflows.length === 0 && (
        <Card className="col-span-full border-none bg-transparent">
          <CardHeader className="items-center gap-4 py-12 text-center">
            <CardTitle>{t("Workflow.noAvailableWorkflows")}</CardTitle>
            <CardDescription>
              No n8n workflows are available for this account.
            </CardDescription>
            <Button asChild className="mt-2">
              <Link href="/workflow">Open Void-Agent workflows</Link>
            </Button>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
