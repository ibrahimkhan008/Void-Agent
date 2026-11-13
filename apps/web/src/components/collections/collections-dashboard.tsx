"use client";

import { Eyebrow } from "@/components/ui/eyebrow";
import { useCollections } from "@/hooks/queries/use-collections";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";

export function CollectionsDashboard() {
  const { data, isLoading, mutate } = useCollections();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const collections = data?.collections ?? [];

  async function createCollection() {
    if (!name.trim()) return toast.error("Collection name is required");
    setSaving(true);
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error("Could not create collection");
      setName("");
      setDescription("");
      await mutate();
      toast.success("Collection created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create collection",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      {/* Section header: eyebrow → display heading → sub. */}
      <header className="space-y-3">
        <Eyebrow>Knowledge</Eyebrow>
        <div>
          <h1 className="text-4xl font-normal tracking-[-0.03em] text-balance">
            Collections
          </h1>
          <p className="mt-2 text-lg/[1.55] text-muted-foreground">
            Private document collections your assistant can search.
          </p>
        </div>
      </header>
      <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-2 text-sm">
          Name
          <Input
            value={name}
            maxLength={128}
            onChange={(event) => setName(event.target.value)}
            placeholder="Research notes"
          />
        </label>
        <label className="grid gap-2 text-sm">
          Description
          <Textarea
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            rows={1}
            placeholder="Optional"
          />
        </label>
        <Button onClick={createCollection} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Create
        </Button>
      </section>
      <section className="grid gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading collections…</p>
        ) : collections.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No collections yet.
          </p>
        ) : (
          collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/knowledge/${encodeURIComponent(collection.id)}`}
              className="rounded-lg border p-4 transition-colors hover:bg-accent/50"
            >
              <p className="font-medium">{collection.name}</p>
              {collection.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {collection.description}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Created {new Date(collection.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
