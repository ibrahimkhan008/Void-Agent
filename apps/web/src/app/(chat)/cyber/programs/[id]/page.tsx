"use client";

import { CyberDialog, StatusBadge } from "@/components/cyber/cyber-ui";
import { Markdown } from "@/components/markdown";
import { cn } from "lib/utils";
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Plus,
  Shield,
  Target,
  Terminal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Program = {
  id: string;
  name: string;
  programHandle: string;
  description: string | null;
  policyMarkdown: string | null;
  hasBounties: boolean;
  currency: string | null;
};

type Scope = {
  id: string;
  assetIdentifier: string;
  assetType: string;
  isInScope: boolean;
  maxSeverityAllowed: string | null;
  instructionNotes: string | null;
};

type SessionSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  domain: "Domain",
  url: "URL",
  wildcard: "Wildcard",
  cidr: "IP/CIDR",
  mobile_app: "Mobile App",
};

function AddScopeModal({
  programId,
  onClose,
  onAdded,
}: {
  programId: string;
  onClose: () => void;
  onAdded: (scope: Scope) => void;
}) {
  const [assetIdentifier, setAssetIdentifier] = useState("");
  const [assetType, setAssetType] = useState("domain");
  const [isInScope, setIsInScope] = useState(true);
  const [instructionNotes, setInstructionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetIdentifier.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cyber/programs/${programId}/scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIdentifier: assetIdentifier.trim(),
          assetType,
          isInScope,
          instructionNotes: instructionNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add scope asset");
        return;
      }
      onAdded(data.scope);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Add Scope Asset"
      description="Register an authorized in-scope asset or explicit out-of-scope boundary."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Asset Identifier *
          </label>
          <input
            type="text"
            value={assetIdentifier}
            onChange={(e) => setAssetIdentifier(e.target.value)}
            required
            placeholder="*.example.com, 10.0.0.0/24, https://api.example.com"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Asset Type
            </label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="domain">Domain</option>
              <option value="wildcard">Wildcard</option>
              <option value="url">URL</option>
              <option value="cidr">IP Range / CIDR</option>
              <option value="mobile_app">Mobile App</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Eligibility
            </label>
            <select
              value={isInScope ? "in" : "out"}
              onChange={(e) => setIsInScope(e.target.value === "in")}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="in">In-Scope (Eligible)</option>
              <option value="out">Out-of-Scope (Prohibited)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Instruction Notes (Optional)
          </label>
          <input
            type="text"
            value={instructionNotes}
            onChange={(e) => setInstructionNotes(e.target.value)}
            placeholder="e.g. No automated credential stuffing"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !assetIdentifier.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {submitting ? "Adding…" : "Add Asset"}
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

export default function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [programId, setProgramId] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"scope" | "sessions" | "policy">(
    "scope",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showAddScope, setShowAddScope] = useState(false);
  const [deletingScopeId, setDeletingScopeId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setProgramId(p.id));
  }, [params]);

  useEffect(() => {
    if (!programId) return;
    fetch(`/api/cyber/programs/${programId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to load program");
          return;
        }
        const data = await res.json();
        setProgram(data.program);
        setScopes(data.scopes ?? []);
        setSessions(data.sessions ?? []);
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [programId]);

  async function startSession() {
    if (!programId || !program) return;
    setStartingSession(true);
    setSessionError(null);
    try {
      const res = await fetch("/api/cyber/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          title: `Research — ${program.name} — ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSessionError(data.error ?? "Failed to create session");
        return;
      }
      router.push(`/cyber/sessions/${data.session.id}`);
    } catch {
      setSessionError("Network error");
    } finally {
      setStartingSession(false);
    }
  }

  async function handleDeleteScope(scopeId: string) {
    if (!programId) return;
    setDeletingScopeId(scopeId);
    try {
      const res = await fetch(
        `/api/cyber/programs/${programId}/scopes?scopeId=${encodeURIComponent(scopeId)}`,
        { method: "DELETE" },
      );
      if (res.ok) setScopes((prev) => prev.filter((s) => s.id !== scopeId));
    } finally {
      setDeletingScopeId(null);
    }
  }

  const inScope = scopes.filter((s) => s.isInScope);
  const outScope = scopes.filter((s) => !s.isInScope);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl space-y-4">
        <div className="h-16 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-56 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error ?? "Program not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-muted-foreground mb-3"
        >
          <Link
            href="/cyber/programs"
            className="hover:text-foreground transition-colors"
          >
            Programs
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{program.name}</span>
        </nav>

        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-accent border border-border shrink-0">
              <Target className="size-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground tracking-tight">
                {program.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                @{program.programHandle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {program.hasBounties && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                Bounty ({program.currency ?? "USD"})
              </span>
            )}
            <Link
              href={`/cyber/scope-checker?programId=${programId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-card border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Shield className="size-3.5 text-muted-foreground" /> Check Scope
            </Link>
            <button
              type="button"
              onClick={startSession}
              disabled={startingSession}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-60 transition-colors"
            >
              {startingSession ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Terminal className="size-3.5" />
              )}
              {startingSession ? "Starting…" : "Start Session"}
            </button>
          </div>
        </header>

        {sessionError && (
          <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {sessionError}
          </div>
        )}
      </div>

      {program.description && (
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[72ch]">
          {program.description}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Program sections"
        className="flex items-center gap-2 border-b border-border"
      >
        {(
          [
            { id: "scope", label: `Scope (${scopes.length})` },
            { id: "sessions", label: `Sessions (${sessions.length})` },
            { id: "policy", label: "Policy & Rules" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-ring text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "scope" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                {inScope.length} in-scope
              </span>
              <span>·</span>
              <span className="text-red-700 dark:text-red-400 font-semibold tabular-nums">
                {outScope.length} out-of-scope
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAddScope(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent border border-border text-foreground text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="size-3.5" /> Add Scope Asset
            </button>
          </div>

          <div className="divide-y divide-border">
            {scopes.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No scope assets defined yet.{" "}
                <button
                  type="button"
                  onClick={() => setShowAddScope(true)}
                  className="text-foreground hover:underline font-medium"
                >
                  Add your first asset
                </button>
              </div>
            ) : (
              [...inScope, ...outScope].map((scope) => (
                <div
                  key={scope.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3",
                    scope.isInScope ? "" : "opacity-75",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-2 h-2 rounded-full",
                      scope.isInScope ? "bg-emerald-500" : "bg-red-500",
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-foreground block truncate">
                      {scope.assetIdentifier}
                    </code>
                    {scope.instructionNotes && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {scope.instructionNotes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                    {ASSET_TYPE_LABELS[scope.assetType] ?? scope.assetType}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border",
                      scope.isInScope
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
                    )}
                  >
                    {scope.isInScope ? "In-Scope" : "Out-of-Scope"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteScope(scope.id)}
                    disabled={deletingScopeId === scope.id}
                    aria-label={`Remove ${scope.assetIdentifier}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {deletingScopeId === scope.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {sessions.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No research sessions started for this program yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/cyber/sessions/${s.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Terminal className="size-4 text-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">
                      {s.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge
                      status={s.status}
                      pulse={s.status === "active"}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "policy" && (
        <div className="bg-card border border-border rounded-xl p-6">
          {program.policyMarkdown ? (
            <div className="prose prose-sm dark:prose-invert max-w-[72ch]">
              <Markdown>{program.policyMarkdown}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No policy markdown defined for this program.
            </p>
          )}
        </div>
      )}

      {showAddScope && programId && (
        <AddScopeModal
          programId={programId}
          onClose={() => setShowAddScope(false)}
          onAdded={(scope) => {
            setScopes((prev) => [scope, ...prev]);
            setShowAddScope(false);
          }}
        />
      )}
    </div>
  );
}
