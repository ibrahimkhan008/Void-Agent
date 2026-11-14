"use client";

import { cn, fetcher } from "lib/utils";
import { Brain, Check, History, Loader2, Save, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Textarea } from "ui/textarea";

interface MemoryRecordView {
  slug: string;
  title: string;
  purpose: string;
  content: string;
  revision: number;
  includeInContext: boolean;
  updatedAt: string;
}

interface RecordRevision {
  revision: number;
  content: string;
  changeNote: string | null;
  createdAt: string;
}

interface RecordProposal {
  id: string;
  scope: "global" | "project";
  projectId: string | null;
  slug: string;
  title: string;
  proposedContent: string;
  changeNote: string | null;
  createdAt: string;
}

/**
 * Void Memory (master prompt §3.3): the user-level record set — MEMORY.md,
 * PERSONA.md, BEHAVIOR.md, SKILLS.md, PREFERENCES.md — with full version
 * history, per-record retrieval tuning, and the approval queue for changes
 * the agent proposed through the propose-record tool.
 */
export function MemoryManager() {
  const recordsKey = "/api/memory/records";
  const proposalsKey = "/api/memory/proposals";
  const { data, error, mutate } = useSWR<{ records: MemoryRecordView[] }>(
    recordsKey,
    fetcher,
  );
  const {
    data: proposalData,
    error: proposalError,
    mutate: mutateProposals,
  } = useSWR<{ proposals: RecordProposal[] }>(proposalsKey, fetcher);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [revisionsFor, setRevisionsFor] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RecordRevision[] | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const records = data?.records ?? [];
  const proposals = proposalData?.proposals ?? [];
  const active = useMemo(
    () => records.find((r) => r.slug === activeSlug) ?? null,
    [records, activeSlug],
  );

  useEffect(() => {
    setDraft(active ? active.content : null);
    setChangeNote("");
  }, [active?.slug, active?.content]);

  // Default to the first record once loaded.
  useEffect(() => {
    if (!activeSlug && records.length) setActiveSlug(records[0].slug);
  }, [records, activeSlug]);

  const selectRecord = (slug: string) => {
    setActiveSlug(slug);
    setRevisionsFor(null);
    setRevisions(null);
  };

  const save = async () => {
    if (!activeSlug || draft === null) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/memory/records/${activeSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft,
          changeNote: changeNote.trim() || undefined,
        }),
      });
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
      const response = await fetch(`/api/memory/records/${slug}`);
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
      const response = await fetch(`/api/memory/records/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
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
      const response = await fetch(`/api/memory/records/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInContext }),
      });
      if (!response.ok) throw new Error();
      await mutate();
    } catch {
      toast.error("Could not update retrieval tuning.");
    } finally {
      setToggling(null);
    }
  };

  const resolveProposal = async (id: string, action: "approve" | "reject") => {
    setResolving(id);
    try {
      const response = await fetch(`/api/memory/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not resolve the proposal.");
      }
      toast.success(
        action === "approve"
          ? "Proposal applied to the record."
          : "Proposal rejected.",
      );
      await Promise.all([mutateProposals(), mutate()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve.");
    } finally {
      setResolving(null);
    }
  };

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Records editor */}
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-4 text-primary" />
            Your records
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            User-level documents every agent reads across projects.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!data ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading memory records…
            </div>
          ) : (
            <>
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
                      r{record.revision}
                    </span>
                    {!record.includeInContext && (
                      <span className="ml-1 text-[10px] text-amber-600">
                        · context off
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {active && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {active.purpose}
                    </p>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={active.includeInContext}
                        disabled={toggling === active.slug}
                        onChange={(e) =>
                          toggleContext(active.slug, e.target.checked)
                        }
                        className="accent-primary"
                      />
                      Include in agent context
                    </label>
                  </div>
                  <Textarea
                    value={draft ?? ""}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={14}
                    className="font-mono text-[13px]"
                  />
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
                      disabled={
                        revisionsFor === active.slug && revisions !== null
                      }
                    >
                      <History className="mr-1.5 size-3.5" />
                      History
                    </Button>
                  </div>

                  {revisionsFor === active.slug && revisions && (
                    <div className="space-y-1.5 rounded-xl border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Revision history
                      </p>
                      {revisions.map((rev) => (
                        <div
                          key={rev.revision}
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs odd:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">r{rev.revision}</span>
                            {rev.changeNote && (
                              <span className="ml-2 truncate text-muted-foreground">
                                {rev.changeNote}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-muted-foreground">
                            {new Date(rev.createdAt).toLocaleString()}
                          </span>
                          {rev.revision !== revisions[0]?.revision && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => restore(active.slug, rev.revision)}
                              disabled={restoring !== null}
                            >
                              {restoring === rev.revision ? (
                                <Loader2 className="mr-1 size-3 animate-spin" />
                              ) : (
                                <Undo2 className="mr-1 size-3" />
                              )}
                              Restore
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Approval queue */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Approval queue</CardTitle>
          <p className="text-xs text-muted-foreground">
            Changes the agent proposed
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {proposalError ? (
            <p className="text-sm text-destructive">
              {(proposalError as Error).message}
            </p>
          ) : !proposalData ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading proposals…
            </div>
          ) : proposals.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nothing waiting. When the agent decides something belongs in
              memory, its proposal lands here for your approval before it
              changes any record.
            </p>
          ) : (
            proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="space-y-2 rounded-xl border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      proposal.scope === "global"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {proposal.scope}
                  </span>
                  <span className="text-sm font-medium">{proposal.title}</span>
                </div>
                {proposal.changeNote && (
                  <p className="text-xs text-muted-foreground">
                    {proposal.changeNote}
                  </p>
                )}
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
                  {proposal.proposedContent}
                </pre>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(proposal.createdAt).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => resolveProposal(proposal.id, "approve")}
                      disabled={resolving !== null}
                    >
                      {resolving === proposal.id ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Check className="mr-1 size-3" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => resolveProposal(proposal.id, "reject")}
                      disabled={resolving !== null}
                    >
                      <X className="mr-1 size-3" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
