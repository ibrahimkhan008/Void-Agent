"use client";

import { Loader2, Plus, Workflow, X } from "lucide-react";
import { useEffect, useState } from "react";
import React from "react";
import { Button } from "ui/button";

type WorkflowSummary = {
  id: string;
  name: string;
  description: string | null;
  icon: unknown;
};
type WorkflowResponse = {
  workflows: Array<WorkflowSummary & { workflowId: string; status: string }>;
  availableWorkflows: WorkflowSummary[];
};

export function ProjectAssignedWorkflows({
  projectId,
}: {
  projectId: string;
}) {
  const [data, setData] = useState<WorkflowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/workflows`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load project workflows");
      setData((await response.json()) as WorkflowResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load project workflows",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const toggle = async (workflowId: string) => {
    const attached = data?.workflows.some(
      (workflow) => workflow.workflowId === workflowId,
    );
    setBusyId(workflowId);
    setError(null);
    try {
      const response = await fetch(
        attached
          ? `/api/projects/${projectId}/workflows?workflowId=${encodeURIComponent(workflowId)}`
          : `/api/projects/${projectId}/workflows`,
        attached
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workflowId }),
            },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Could not update project workflows",
        );
      }
      await refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update project workflows",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading workflowsâ€¦
      </p>
    );

  return (
    <section aria-label="Project workflows" className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Project workflows</h3>
        <p className="text-xs text-muted-foreground">
          Attach workflows as project configuration. Assignment does not run a
          workflow; start and approve executions from the workflow interface.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data?.availableWorkflows.length ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Workflow className="mx-auto mb-2 size-6" />
          No workflows available to attach.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.availableWorkflows.map((workflow) => {
            const attached = data.workflows.some(
              (item) => item.workflowId === workflow.id,
            );
            return (
              <li
                key={workflow.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {workflow.name}
                  </p>
                  {workflow.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {workflow.description}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={attached ? "secondary" : "outline"}
                  disabled={busyId === workflow.id}
                  onClick={() => void toggle(workflow.id)}
                >
                  {busyId === workflow.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : attached ? (
                    <X className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {attached ? "Remove" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {data?.workflows.length ? (
        <p className="text-xs text-muted-foreground">
          {data.workflows.length} workflow(s) assigned.
        </p>
      ) : null}
    </section>
  );
}
