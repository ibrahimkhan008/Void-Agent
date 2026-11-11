"use client";

import { useArchives } from "@/hooks/queries/use-archives";
import { Archive, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "ui/button";
import { CommandItem } from "ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";

export function ArchiveThreadDialog({ threadId }: { threadId: string }) {
  const { data, isLoading } = useArchives();
  const [open, setOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function add(archiveId: string) {
    setSavingId(archiveId);
    try {
      const response = await fetch(`/api/archive/${archiveId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: threadId }),
      });
      if (!response.ok) throw new Error("Conversation could not be archived");
      await mutate("/api/archive");
      setOpen(false);
      toast.success("Conversation added to archive");
    } catch {
      toast.error("Conversation could not be added to archive");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <CommandItem className="cursor-pointer p-0">
          <div className="flex w-full items-center gap-2 rounded px-2 py-1">
            <Archive className="text-foreground" />
            <span>Save to archive</span>
          </div>
        </CommandItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save conversation</DialogTitle>
          <DialogDescription>
            Choose one of your private archives.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading archives…</p>
          ) : null}
          {!isLoading && data?.archives.length
            ? data.archives.map((archive) => (
                <Button
                  key={archive.id}
                  variant="outline"
                  className="w-full justify-between"
                  disabled={savingId !== null}
                  onClick={() => void add(archive.id)}
                >
                  <span className="truncate">{archive.name}</span>
                  {savingId === archive.id ? (
                    <span>Saving…</span>
                  ) : (
                    <span>{archive.itemCount}</span>
                  )}
                </Button>
              ))
            : null}
          {!isLoading && !data?.archives.length ? (
            <p className="text-sm text-muted-foreground">
              Create an archive before saving a conversation.
            </p>
          ) : null}
        </div>
        <Link
          href="/archives"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-2 text-sm text-primary"
        >
          Manage archives <ArrowUpRight className="size-4" />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
