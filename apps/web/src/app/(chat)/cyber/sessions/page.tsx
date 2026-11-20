"use client";

import {
  CyberDialog,
  CyberPageHeader,
  StatusBadge,
} from "@/components/cyber/cyber-ui";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Plus,
  Terminal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Session = {
  id: string;
  title: string;
  status: string;
  programId: string;
  createdAt: string;
  updatedAt: string;
};

type Program = { id: string; name: string; programHandle: string };

function NewSessionModal({
  programs,
  onClose,
  onCreated,
}: {
  programs: Program[];
  onClose: () => void;
  onCreated: (session: Session) => void;
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!programId || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cyber/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create session");
        return;
      }
      onCreated(data.session);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="New Research Session"
      description="Bind a workspace to a scoped target program with live pre-flight enforcement."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Target Program *
          </label>
          <div className="relative">
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              required
              className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pr-8"
            >
              <option value="">Select program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (@{p.programHandle})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Session Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. API Auth & IDOR Audit — Staging"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !programId || !title.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {submitting ? "Creating…" : "Create Session"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </CyberDialog>
  );
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/cyber/sessions").then((r) => r.json()),
      fetch("/api/cyber/programs").then((r) => r.json()),
    ])
      .then(([sessData, progData]) => {
        setSessions(sessData.sessions ?? []);
        setPrograms(progData.programs ?? []);
      })
      .catch(() => setError("Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Research Sessions"
        description="Active and archived scope-bound security research workspaces."
        actions={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> New Session
          </button>
        }
      />

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 bg-muted/60 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Terminal className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No research sessions yet
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Start a workspace bound to a scoped program to collaborate with Void
            Cyber specialist agents and log findings.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Start First Session
          </button>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((session) => {
            const prog = programs.find((p) => p.id === session.programId);
            return (
              <div
                key={session.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-border transition-colors flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="size-4 text-foreground shrink-0" />
                      <h2 className="font-semibold text-sm text-foreground truncate">
                        {session.title}
                      </h2>
                    </div>
                    <StatusBadge
                      status={session.status}
                      pulse={session.status === "active"}
                    />
                  </div>
                  {prog && (
                    <p className="text-xs text-muted-foreground">
                      {prog.name} (@{prog.programHandle})
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums mt-1">
                    Started {new Date(session.createdAt).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/cyber/sessions/${session.id}`)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-accent border border-border text-foreground text-xs font-semibold hover:bg-accent transition-colors"
                >
                  <Terminal className="size-3.5" /> Open Workspace
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <NewSessionModal
          programs={programs}
          onClose={() => setShowModal(false)}
          onCreated={(session) => {
            setShowModal(false);
            router.push(`/cyber/sessions/${session.id}`);
          }}
        />
      )}
    </div>
  );
}
