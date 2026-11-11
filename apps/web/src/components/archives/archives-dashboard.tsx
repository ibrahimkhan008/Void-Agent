"use client";

import { ArchiveDialog } from "@/components/archives/archive-dialog";
import { useArchives } from "@/hooks/queries/use-archives";
import { Archive as ArchiveIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";
import { Skeleton } from "ui/skeleton";

export function ArchivesDashboard() {
  const { data, isLoading } = useArchives();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this archive? Its conversations will remain in your chat history.",
      )
    )
      return;
    setDeletingId(id);
    try {
      const response = await fetch(`/api/archive/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      await mutate("/api/archive");
      toast.success("Archive deleted");
    } catch {
      toast.error("Archive could not be deleted");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Archives</h1>
          <p className="text-sm text-muted-foreground">
            Organize conversations without removing them from chat history.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 size-4" /> New archive
        </Button>
      </header>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20 w-full" />
          ))}
        </div>
      ) : data?.archives.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.archives.map((archive) => (
            <Card key={archive.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <ArchiveIcon className="size-5 shrink-0 text-muted-foreground" />
                <Link
                  href={`/archives/${archive.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate font-medium">{archive.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {archive.description ||
                      `${archive.itemCount} conversations`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {archive.itemCount} conversations
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${archive.name}`}
                  disabled={deletingId === archive.id}
                  onClick={() => void remove(archive.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No archives yet. Create one, then save conversations from their chat
            menu.
          </CardContent>
        </Card>
      )}
      <ArchiveDialog open={creating} onOpenChange={setCreating} />
    </main>
  );
}
