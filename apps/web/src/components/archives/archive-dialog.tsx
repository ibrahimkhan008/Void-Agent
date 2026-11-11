"use client";

import type { Archive } from "@/types/archive";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";

export function ArchiveDialog({
  open,
  onOpenChange,
  archive,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archive?: Pick<Archive, "id" | "name" | "description">;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(archive?.name ?? "");
  const [description, setDescription] = useState(archive?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(archive?.name ?? "");
      setDescription(archive?.description ?? "");
    }
  }, [archive, open]);

  async function save() {
    const normalizedName = name.trim();
    if (
      !normalizedName ||
      normalizedName.length > 100 ||
      description.length > 500
    ) {
      toast.error(
        "Use a name up to 100 characters and description up to 500 characters.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        archive ? `/api/archive/${archive.id}` : "/api/archive",
        {
          method: archive ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: normalizedName, description }),
        },
      );
      if (!response.ok) throw new Error("Archive could not be saved");
      await mutate("/api/archive");
      onSaved?.();
      onOpenChange(false);
      toast.success(archive ? "Archive updated" : "Archive created");
    } catch {
      toast.error("Archive could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {archive ? "Edit archive" : "Create archive"}
          </DialogTitle>
          <DialogDescription>
            Keep conversations grouped in a private archive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="archive-name">Name</Label>
            <Input
              id="archive-name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="archive-description">Description</Label>
            <Textarea
              id="archive-description"
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
