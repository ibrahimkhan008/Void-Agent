"use client";

import { useCollections } from "@/hooks/queries/use-collections";
import type { CollectionItem } from "@/hooks/queries/use-collections";
import type { ReviewColumn } from "lib/tabular/review-schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";

const presets = [
  { id: "summary", label: "Summary", type: "text", prompt: "Summarize the document in 2-3 sentences." },
  { id: "parties", label: "Parties", type: "list", prompt: "Identify the named people or organizations and their roles." },
  { id: "key_dates", label: "Key dates", type: "date", prompt: "List the important dates and what each date refers to." },
  { id: "obligations", label: "Obligations", type: "list", prompt: "List the main obligations stated in the document." },
  { id: "risks", label: "Risks", type: "list", prompt: "Identify material risks explicitly described in this document." },
  { id: "jurisdiction", label: "Jurisdiction", type: "text", prompt: "Identify the governing law and jurisdiction, if stated." },
] as const;

type ReviewItem = CollectionItem & { collectionName: string };
type ReviewSummary = { id: string; title: string; status: string; updatedAt: string };

export default function TabularReviewsDashboard() {
  const router = useRouter();
  const { data } = useCollections();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>(["summary", "parties", "key_dates"]);
  const [title, setTitle] = useState("Document comparison");
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const collections = data?.collections ?? [];
        const results = await Promise.all(collections.map(async (collection) => {
          const response = await fetch(`/api/collections/${collection.id}`);
          if (!response.ok) return [];
          const payload = await response.json() as { items?: CollectionItem[] };
          return (payload.items ?? []).filter((item) => item.status === "ready").map((item) => ({ ...item, collectionName: collection.name }));
        }));
        if (!cancelled) setItems(results.flat());
      } catch {
        if (!cancelled) toast.error("Could not load knowledge documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [data?.collections]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tabular-reviews").then(async (response) => {
      if (!response.ok) throw new Error("Could not load previous reviews");
      const payload = await response.json() as { reviews: ReviewSummary[] };
      if (!cancelled) setReviews(payload.reviews);
    }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load previous reviews");
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 20 ? current : [...current, id]);
  const create = async () => {
    const columns: ReviewColumn[] = presets.filter((preset) => fields.includes(preset.id)).map((preset) => ({ ...preset }));
    if (customPrompt.trim()) columns.push({ id: "custom", label: "Custom", type: "text", prompt: customPrompt.trim() });
    if (!selected.length || !columns.length) return toast.error("Choose documents and at least one review field");
    setCreating(true);
    try {
      const response = await fetch("/api/tabular-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, itemIds: selected, columns }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || await response.text() || "Could not create review");
      router.push(`/tabular-reviews/${result.review.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create review");
      setCreating(false);
    }
  };

  return <main className="mx-auto w-full max-w-5xl px-6 py-8">
    <h1 className="text-2xl font-semibold">Tabular reviews</h1>
    <p className="mt-2 text-sm text-muted-foreground">Compare the same facts across documents already processed in your Knowledge collections.</p>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="rounded-xl border p-4">
        <h2 className="font-medium">Choose documents <span className="text-muted-foreground">({selected.length}/20)</span></h2>
        {loading ? <p className="py-8 text-sm text-muted-foreground">Loading documents…</p> : items.length ? <div className="mt-3 max-h-[32rem] divide-y overflow-y-auto">
          {items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 py-3 text-sm">
            <input type="checkbox" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 20} onChange={() => toggle(item.id)} className="mt-1" />
            <span className="min-w-0"><span className="block truncate font-medium">{item.filename || item.sourceUrl || "Untitled source"}</span><span className="text-muted-foreground">{item.collectionName}</span></span>
          </label>)}
        </div> : <p className="py-8 text-sm text-muted-foreground">Add and process documents in Knowledge first.</p>}
      </section>
      <section className="flex flex-col gap-4 rounded-xl border p-4">
        <div><Label htmlFor="review-title">Review title</Label><Input id="review-title" className="mt-1" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></div>
        <div><h2 className="font-medium">Fields</h2><div className="mt-2 flex flex-col gap-2">{presets.map((preset) => <label key={preset.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fields.includes(preset.id)} onChange={() => setFields((current) => current.includes(preset.id) ? current.filter((id) => id !== preset.id) : [...current, preset.id])} />{preset.label}</label>)}</div></div>
        <div><Label htmlFor="custom-review-field">Custom question (optional)</Label><Input id="custom-review-field" className="mt-1" maxLength={500} value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="What is the renewal term?" /></div>
        <Button onClick={create} disabled={creating || !selected.length}>{creating ? "Creating…" : "Create comparison"}</Button>
      </section>
    </div>
    {reviews.length > 0 && <section className="mt-10"><h2 className="font-semibold">Recent reviews</h2><div className="mt-3 divide-y rounded-xl border">{reviews.map((review) => <Link key={review.id} href={`/tabular-reviews/${review.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted/40"><span className="font-medium">{review.title}</span><span className="text-muted-foreground">{review.status}</span></Link>)}</div></section>}
  </main>;
}
