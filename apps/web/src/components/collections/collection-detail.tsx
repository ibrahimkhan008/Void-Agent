"use client";

import { useCollection } from "@/hooks/queries/use-collections";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ArrowLeft, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";

export function CollectionDetail({ id }: { id: string }) {
  const { data, isLoading, mutate } = useCollection(id);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitItem(body: BodyInit, headers?: HeadersInit) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/collections/${encodeURIComponent(id)}/items`,
        { method: "POST", headers, body },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not add item");
      toast.success("Added to collection. Processing may take a moment.");
      setText("");
      setUrl("");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add item",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(itemId: string) {
    const response = await fetch(
      `/api/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) return toast.error("Could not remove item");
    await mutate();
  }

  async function deleteCollection() {
    if (!window.confirm("Delete this collection and all its indexed content?"))
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/collections/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not delete collection");
      window.location.assign("/knowledge");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete collection",
      );
    } finally {
      setBusy(false);
    }
  }

  if (isLoading)
    return (
      <main className="p-8 text-sm text-muted-foreground">
        Loading collection…
      </main>
    );
  if (!data) return <main className="p-8">Collection not found.</main>;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All collections
      </Link>
      {/* Cognix detail header (§4.8): eyebrow → display heading. */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>Knowledge</Eyebrow>
          <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
            {data.collection.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.collection.description || "Private collection"}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={deleteCollection}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </header>
      <section className="grid gap-4 rounded-lg border p-4">
        <label className="grid gap-2 text-sm">
          Add text
          <Textarea
            value={text}
            maxLength={500_000}
            rows={4}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste text to index"
          />
        </label>
        <Button
          disabled={busy || !text.trim()}
          onClick={() =>
            submitItem(JSON.stringify({ text }), {
              "Content-Type": "application/json",
            })
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Add text
        </Button>
        <label className="grid gap-2 text-sm">
          Add public HTTPS page
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/article"
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy || !url.trim()}
          onClick={() =>
            submitItem(JSON.stringify({ url }), {
              "Content-Type": "application/json",
            })
          }
        >
          Import URL
        </Button>
        <label className="grid gap-2 text-sm">
          Upload document
          <Input
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.json,.yaml,.yml"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                const form = new FormData();
                form.set("file", file);
                void submitItem(form);
                event.currentTarget.value = "";
              }
            }}
          />
        </label>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Items</h2>
        {data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No items in this collection.
          </p>
        ) : (
          data.items.map((item) => (
            <article
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {item.filename || "Untitled source"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.status}
                  {item.chunkCount ? ` · ${item.chunkCount} chunks` : ""}
                  {item.sourceUrl ? ` · ${item.sourceUrl}` : ""}
                </p>
                {item.error && (
                  <p className="text-xs text-destructive">{item.error}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.filename || "item"}`}
                onClick={() => void deleteItem(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </article>
          ))
        )}
        {data.nextCursor && (
          <Button
            variant="outline"
            onClick={async () => {
              const response = await fetch(
                `/api/collections/${encodeURIComponent(id)}/items?cursor=${encodeURIComponent(data.nextCursor!)}`,
              );
              if (response.ok) {
                const page = await response.json();
                await mutate(
                  {
                    ...data,
                    items: [...data.items, ...page.items],
                    nextCursor: page.nextCursor,
                  },
                  false,
                );
              }
            }}
          >
            Load older items
          </Button>
        )}
      </section>
    </main>
  );
}
