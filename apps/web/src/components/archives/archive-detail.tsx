"use client";

import { ArchiveDialog } from "@/components/archives/archive-dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Archive, ArchivedThread } from "@/types/archive";
import {
  Archive as ArchiveIcon,
  ArrowLeft,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";

export function ArchiveDetail({
  archive,
  threads,
}: {
  archive: Archive;
  threads: ArchivedThread[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function removeThread(threadId: string) {
    setBusyThreadId(threadId);
    try {
      const response = await fetch(
        `/api/archive/${archive.id}/items/${threadId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Remove failed");
      router.refresh();
      await mutate("/api/archive");
      toast.success("Conversation removed from archive");
    } catch {
      toast.error("Conversation could not be removed");
    } finally {
      setBusyThreadId(null);
    }
  }

  async function deleteArchive() {
    if (
      !window.confirm(
        "Delete this archive? Conversations remain in your chat history.",
      )
    )
      return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/archive/${archive.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      await mutate("/api/archive");
      router.push("/archives");
      toast.success("Archive deleted");
    } catch {
      toast.error("Archive could not be deleted");
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        href="/archives"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All archives
      </Link>
      {/* Void Agent detail header (§4.8): eyebrow → display heading. */}
      <header className="flex flex-wrap items-start gap-3">
        <ArchiveIcon className="mt-9 size-6 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <Eyebrow>History</Eyebrow>
          <h1 className="break-words text-3xl font-normal tracking-[-0.03em] text-balance">
            {archive.name}
          </h1>
          {archive.description && (
            <p className="text-sm text-muted-foreground">
              {archive.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Created {new Date(archive.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 size-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          onClick={() => void deleteArchive()}
          disabled={deleting}
        >
          <Trash2 className="mr-2 size-4" /> {deleting ? "Deleting…" : "Delete"}
        </Button>
      </header>
      <section className="space-y-3" aria-label="Archived conversations">
        {threads.length ? (
          threads.map((thread) => (
            <Card key={thread.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <Link href={`/chat/${thread.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {thread.title || "New Chat"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(
                      thread.lastMessageAt ?? thread.createdAt,
                    ).toLocaleString()}
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${thread.title || "conversation"} from archive`}
                  disabled={busyThreadId === thread.id}
                  onClick={() => void removeThread(thread.id)}
                >
                  <X className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No conversations in this archive. Add one from a conversation’s
              menu.
            </CardContent>
          </Card>
        )}
      </section>
      <ArchiveDialog
        open={editing}
        onOpenChange={setEditing}
        archive={archive}
        onSaved={() => router.refresh()}
      />
    </main>
  );
}
