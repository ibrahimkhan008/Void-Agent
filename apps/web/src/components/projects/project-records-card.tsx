"use client";

import { cn } from "lib/utils";
import { fetcher } from "lib/utils";
import { History, Loader2, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Textarea } from "ui/textarea";

interface RecordView {
  slug: string;
  title: string;
  purpose: string;
  content: string;
  revision: number;
  revisionCount: number;
  includeInContext: boolean;
}

interface Revision {
  revision: number;
  content: string;
  changeNote: string | null;
  createdAt: string;
}

/**
 * The structured project records (master prompt §3.3): nine well-known,
 * versioned markdown documents — MEMORY.md, TODO.md, DONT.md, RULES.md,
 * STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md, DEPLOYMENT.md.
 * Every save appends a revision; restores append the restored content as a
 * new revision, so history never rewrites itself.
 */
export function ProjectRecordsCard({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const recordsKey = `/api/projects/${projectId}/records`;
  const { data, error, mutate } = useSWR<{ records: RecordView[] }>(
    recordsKey,
    fetcher,
  );

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [revisionsFor, setRevisionsFor] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const records = data?.records ?? [];
  const active = useMemo(
    () => records.find((r) => r.slug === activeSlug) ?? null,
    [records, activeSlug],
  );

  // Sync the draft when the active record changes or its server content updates.
  useEffect(() => {
    setDraft(active ? active.content : null);
    setChangeNote("");
  }, [active?.slug, active?.content]);

  const selectRecord = (slug: string) => {
    setActiveSlug(slug);
    setRevisionsFor(null);
    setRevisions(null);
  };

  const save = async () => {
    if (!activeSlug || draft === null) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/records/${activeSlug}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: draft,
            changeNote: changeNote.trim() || undefined,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not save the record.");
      }
      const payload = await response.json();
      toast.success(`Saved as revision ${payload.revision}.`);
      setChangeNote("");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const loadRevisions = async (slug: string) => {
    setRevisionsFor(slug);
    setRevisions(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/records/${slug}`,
      );
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setRevisions(payload.revisions ?? []);
    } catch {
      toast.error("Could not load the revision history.");
      setRevisionsFor(null);
    }
  };

  const restore = async (slug: string, revision: number) => {
    setRestoring(revision);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/records/${slug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not restore the revision.");
      }
      toast.success(`Revision ${revision} restored as the current version.`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore.");
    } finally {
      setRestoring(null);
    }
  };

  const toggleContext = async (slug: string, includeInContext: boolean) => {
    setToggling(slug);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/records/${slug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeInContext }),
        },
      );
      if (!response.ok) throw new Error();
      await mutate();
    } catch {
      toast.error("Could not update retrieval tuning.");
    } finally {
      setToggling(null);
    }
  };

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }
  if (!data) {
    return (
      <Card className="lg:col-span-2">
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading project records…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Records</CardTitle>
        <p className="text-xs text-muted-foreground">
          Versioned project documents the agents read as context.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {records.map((record) => (
            <button
              key={record.slug}
              type="button"
              onClick={() => selectRecord(record.slug)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                activeSlug === record.slug
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {record.title}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                r{record.revisionCount}
              </span>
            </button>
          ))}
        </div>

        {active && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{active.purpose}</p>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={active.includeInContext}
                  disabled={!canEdit || toggling === active.slug}
                  onChange={(e) => toggleContext(active.slug, e.target.checked)}
                  className="accent-primary"
                />
                Include in agent context
              </label>
            </div>
            <Textarea
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canEdit}
              rows={10}
              className="font-mono text-[13px]"
            />
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Change note (optional)"
                  className="h-9 min-w-[220px] flex-1 rounded-lg border px-3 text-sm"
                />
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving || draft === active.content}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-3.5" />
                  )}
                  Save revision
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadRevisions(active.slug)}
                  disabled={revisionsFor === active.slug && revisions !== null}
                >
                  <History className="mr-1.5 size-3.5" />
                  History
                </Button>
              </div>
            )}

            {/* Revision history */}
            {revisionsFor === active.slug && revisions && (
              <div className="space-y-1.5 rounded-xl border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Revision history
                </p>
                {revisions.map((rev) => (
                  <div
                    key={rev.revision}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      r{rev.revision}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {rev.changeNote ?? "No note"} ·{" "}
                      {new Date(rev.createdAt).toLocaleString()}
                    </span>
                    {canEdit && rev.revision !== active?.revision && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={restoring !== null}
                        onClick={() => restore(active.slug, rev.revision)}
                      >
                        {restoring === rev.revision ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <>
                            <Undo2 className="mr-1 size-3" />
                            Restore
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
                {revisions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No revisions yet.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
