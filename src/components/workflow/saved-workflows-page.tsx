"use client";

import useSWR, { mutate } from "swr";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { Skeleton } from "ui/skeleton";
import { Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { toast } from "sonner";
import { notify } from "lib/notify";
import { useTranslations } from "next-intl";

type SavedDraft = { id: string; name: string; description?: string | null; updatedAt: string };

export default function SavedWorkflowsPage() {
  const router = useRouter();
  const t = useTranslations();
  const { data: workflows = [], isLoading } = useSWR<SavedDraft[]>("/api/saved-workflows", fetcher);
  const [creating, setCreating] = useState(false);

  const createDraft = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/saved-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New workflow" }),
      });
      if (!response.ok) throw new Error("Could not create workflow draft");
      const draft = (await response.json()) as SavedDraft;
      await mutate("/api/saved-workflows");
      router.push(`/saved-workflows/${draft.id}`);
    } catch {
      toast.error("Could not create workflow draft");
    } finally {
      setCreating(false);
    }
  };

  const deleteDraft = async (id: string) => {
    const confirmed = await notify.confirm({ description: t("Workflow.deleteConfirm") });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/saved-workflows/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete workflow draft");
      await mutate("/api/saved-workflows");
      toast.success(t("Workflow.deleted"));
    } catch {
      toast.error("Could not delete workflow draft");
    }
  };

  return (
    <section className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6 md:p-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Saved workflow drafts</h1>
          <p className="text-sm text-muted-foreground">Private workflows saved in Void-Agent.</p>
        </div>
        <Button onClick={createDraft} disabled={creating}>Create draft</Button>
      </header>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : workflows.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="bg-secondary hover:bg-input">
              <CardHeader>
                <div className="flex items-center gap-2"><WorkflowIcon className="size-4 text-muted-foreground" /><CardTitle className="truncate text-base"><Link href={`/saved-workflows/${workflow.id}`}>{workflow.name}</Link></CardTitle><span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Draft</span><Button variant="ghost" size="icon" className="ml-auto" aria-label={`Delete ${workflow.name}`} onClick={() => { void deleteDraft(workflow.id); }}><Trash2 className="size-4" /></Button></div>
                {workflow.description && <CardDescription className="line-clamp-2">{workflow.description}</CardDescription>}
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No saved workflow drafts yet.</p>}
    </section>
  );
}
