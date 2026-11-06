"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

type Column = { id: string; label: string; type: string; prompt: string };
type Cell = { itemId: string; columnId: string; value: string | null; status: "pending" | "generating" | "done" | "error" };
type ReviewData = {
  review: { id: string; title: string; status: string; columns: Column[] };
  items: Array<{ itemId: string; rowIndex: number; filename: string | null }>;
  cells: Cell[];
};

export default function TabularReviewDetail({ id }: { id: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tabular-reviews/${id}`);
    if (!response.ok) throw new Error(response.status === 404 ? "Review not found" : "Could not load review");
    setData(await response.json() as ReviewData);
  }, [id]);

  const generate = useCallback(async (target?: { itemId: string; columnId: string }) => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/tabular-reviews/${id}/generate`, {
        method: "POST",
        ...(target ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) } : {}),
      });
      if (!response.ok || !response.body) throw new Error(await response.text() || "Generation could not start");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const line = block.split("\n").find((part) => part.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5)) as { type: string; itemId?: string; columnId?: string; value?: string; status?: Cell["status"]; message?: string };
            if (event.type === "cell" && event.itemId && event.columnId) {
              setData((current) => current ? ({ ...current, cells: current.cells.map((cell) => cell.itemId === event.itemId && cell.columnId === event.columnId ? { ...cell, value: event.value ?? "", status: event.status ?? "done" } : cell) }) : current);
            } else if (event.type === "error") toast.error(event.message || "Review stopped");
          } catch { /* Ignore malformed or partial stream frames. */ }
        }
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review generation failed");
      await refresh().catch(() => undefined);
    } finally {
      setGenerating(false);
    }
  }, [id, refresh]);

  const saveCell = useCallback(async (itemId: string, columnId: string) => {
    try {
      const response = await fetch(`/api/tabular-reviews/${id}/cells`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, columnId, value: draft }),
      });
      if (!response.ok) {
        toast.error(await response.text() || "Could not save this cell");
        return;
      }
      setData((current) => current ? {
        ...current,
        cells: current.cells.map((cell) => cell.itemId === itemId && cell.columnId === columnId
          ? { ...cell, value: draft, status: "done" }
          : cell),
      } : current);
      setEditing(null);
      toast.success("Cell updated");
    } catch {
      toast.error("Could not save this cell");
    }
  }, [draft, id]);

  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      if (cancelled || started.current) return;
      started.current = true;
      // Load again to check the persisted state before deciding to generate.
      void fetch(`/api/tabular-reviews/${id}`).then(async (response) => {
        if (!response.ok) return;
        const current = await response.json() as ReviewData;
        if (cancelled) return;
        setData(current);
        if (current.review.status === "pending" || current.review.status === "error") void generate();
      });
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load review")).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [generate, id, refresh]);

  useEffect(() => {
    if (data?.review.status !== "generating" || generating) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [data?.review.status, generating, refresh]);

  const cellMap = new Map((data?.cells ?? []).map((cell) => [`${cell.itemId}:${cell.columnId}`, cell]));
  if (loading) return <main className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">Loading comparison…</main>;
  if (!data) return <main className="mx-auto max-w-6xl px-6 py-10">Review not found.</main>;

  return <main className="mx-auto max-w-6xl px-6 py-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/tabular-reviews" className="text-sm text-muted-foreground hover:text-foreground">All reviews</Link><h1 className="mt-2 text-2xl font-semibold">{data.review.title}</h1><p className="mt-1 text-sm text-muted-foreground">{data.items.length} documents · {data.review.columns.length} fields · {generating ? "Generating" : data.review.status}</p></div>
      <div className="flex gap-2"><Button variant="outline" asChild><a href={`/api/tabular-reviews/${id}/export`}>Export Excel</a></Button>{data.review.status === "error" && <Button onClick={() => void generate()} disabled={generating}>{generating ? "Retrying…" : "Retry failed cells"}</Button>}</div>
    </div>
    <div className="mt-6 overflow-auto rounded-xl border">
      <table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="bg-muted/60"><th className="sticky left-0 min-w-48 border-b p-3 text-left">Document</th>{data.review.columns.map((column) => <th key={column.id} className="min-w-56 border-b p-3 text-left">{column.label}</th>)}</tr></thead><tbody>
        {data.items.map((item) => <tr key={item.itemId} className="align-top"><th className="sticky left-0 border-b bg-background p-3 text-left font-medium">{item.filename || "Untitled source"}</th>{data.review.columns.map((column) => {
          const cell = cellMap.get(`${item.itemId}:${column.id}`);
          const key = `${item.itemId}:${column.id}`;
          return <td key={column.id} className="min-w-56 border-b p-3 text-muted-foreground">
            {editing === key ? <div className="space-y-2">
              <textarea aria-label={`Edit ${column.label} for ${item.filename || "source document"}`} value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} className="min-h-24 w-full rounded-md border bg-background p-2 text-foreground" />
              <div className="flex gap-2"><Button size="sm" onClick={() => void saveCell(item.itemId, column.id)}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
            </div> : <>
              <div className="whitespace-pre-wrap">{cell?.status === "generating" ? "Generating…" : cell?.value || (cell?.status === "error" ? "Generation failed" : generating ? "Waiting…" : "—")}</div>
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="ghost" disabled={generating || cell?.status === "generating"} onClick={() => { setDraft(cell?.value ?? ""); setEditing(key); }}>Edit</Button>
                <Button size="sm" variant="ghost" disabled={generating || cell?.status === "generating"} onClick={() => void generate({ itemId: item.itemId, columnId: column.id })}>Regenerate</Button>
              </div>
            </>}
          </td>;
        })}</tr>)}
      </tbody></table>
    </div>
    {generating && <p className="mt-3 text-xs text-muted-foreground">Processing at most three document fields at a time. This page may remain open while generation runs.</p>}
  </main>;
}
