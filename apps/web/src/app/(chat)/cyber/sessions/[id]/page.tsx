"use client";

import { CyberDialog, SeverityBadge } from "@/components/cyber/cyber-ui";
import { Markdown } from "@/components/markdown";
import { cn } from "lib/utils";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SessionData = {
  id: string;
  title: string;
  status: string;
  programId: string;
  createdAt: string;
};

type Finding = {
  id: string;
  title: string;
  severity: string;
  status: string;
};

type Program = { id: string; name: string; programHandle: string };
type Scope = {
  id: string;
  assetIdentifier: string;
  assetType: string;
  isInScope: boolean;
};

type ScopeCheckBadge = {
  target: string;
  status: string;
  isInScope: boolean;
  reason: string;
};

type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  agentLabel?: string;
  blocked?: boolean;
  scopeChecks?: ScopeCheckBadge[];
};

const AGENT_MODES = [
  { id: "orchestrator", label: "Orchestrator" },
  { id: "recon", label: "Recon" },
  { id: "web", label: "Web Sec" },
  { id: "api", label: "API Sec" },
  { id: "verifier", label: "Verifier" },
];

const STARTER_PROMPTS = [
  "Build a passive reconnaissance checklist for the in-scope assets",
  "Suggest high-signal IDOR and authorization test cases for this scope",
  "Outline a safe, minimal-impact API security testing plan",
];

function AddFindingDialog({
  sessionId,
  defaultAsset,
  onClose,
  onAdded,
}: {
  sessionId: string;
  defaultAsset?: string;
  onClose: () => void;
  onAdded: (finding: Finding) => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affectedAsset, setAffectedAsset] = useState(defaultAsset ?? "");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [poc, setPoc] = useState("");
  const [impact, setImpact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/cyber/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          title,
          severity,
          affectedAsset,
          reproductionSteps,
          proofOfConcept: poc,
          impactDescription: impact,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add finding");
        return;
      }
      onAdded(data.finding);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Log Security Finding"
      description="Capture reproducible details for verification and report compilation."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Finding title *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Severity"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          >
            {["critical", "high", "medium", "low", "info"].map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={affectedAsset}
            onChange={(e) => setAffectedAsset(e.target.value)}
            required
            placeholder="Affected asset *"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          />
        </div>
        <textarea
          value={reproductionSteps}
          onChange={(e) => setReproductionSteps(e.target.value)}
          required
          rows={3}
          placeholder="Step-by-step reproduction instructions *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 resize-none"
        />
        <textarea
          value={poc}
          onChange={(e) => setPoc(e.target.value)}
          required
          rows={3}
          placeholder="Proof of concept / HTTP request or payload *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 resize-none"
        />
        <textarea
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          required
          rows={2}
          placeholder="Impact description *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 resize-none"
        />
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Bug className="size-4" />
          )}
          {submitting ? "Saving…" : "Save Finding"}
        </button>
      </form>
    </CyberDialog>
  );
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentMode, setAgentMode] = useState("orchestrator");
  const [mobilePane, setMobilePane] = useState<"chat" | "scope" | "findings">(
    "chat",
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showAddFinding, setShowAddFinding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    params.then((p) => setSessionId(p.id));
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;
    Promise.all([
      fetch(`/api/cyber/sessions/${sessionId}`).then((r) => r.json()),
      fetch(`/api/cyber/findings?sessionId=${sessionId}`).then((r) => r.json()),
    ])
      .then(([sessData, findData]) => {
        const s = sessData.session;
        setSession(s);
        setFindings(findData.findings ?? []);
        if (s?.programId) {
          fetch(`/api/cyber/programs/${s.programId}`)
            .then((r) => r.json())
            .then((d) => {
              setProgram(d.program);
              setScopes(d.scopes ?? []);
            });
        }
        setMessages([
          {
            id: "system-welcome",
            role: "system",
            content: `Workspace active for "${s?.title ?? sessionId}". Pre-flight scope enforcement is enabled — out-of-scope targets are deterministically blocked and recorded in the audit trail.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleStatusChange(nextStatus: string) {
    if (!sessionId) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/cyber/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (res.ok && data.session) setSession(data.session);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function dispatchCommand(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || !sessionId) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/cyber/sessions/${sessionId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed, agentMode, history }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `resp-${Date.now()}`,
          role: "assistant",
          content:
            data.response ??
            data.error ??
            "Command dispatched. Agent processing…",
          timestamp: new Date().toISOString(),
          agentLabel: data.agentLabel,
          blocked: Boolean(data.blocked),
          scopeChecks: data.scopeChecks,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Network error while dispatching command to agent.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-12 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-[65vh] bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  const inScope = scopes.filter((s) => s.isInScope);
  const outScope = scopes.filter((s) => !s.isInScope);
  const hasUserMessages = messages.some((m) => m.role === "user");

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="xl:hidden flex items-center gap-1 px-4 py-2 border-b border-border bg-card/60">
        {(
          [
            { id: "chat", label: "Specialist Agent" },
            { id: "scope", label: `Scope (${scopes.length})` },
            { id: "findings", label: `Findings (${findings.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobilePane(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              mobilePane === tab.id
                ? "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className={cn(
            "flex-col w-full lg:w-60 shrink-0 border-r border-border bg-card/40 overflow-y-auto",
            mobilePane === "scope" ? "flex lg:flex" : "hidden lg:flex",
          )}
        >
          <div className="p-4 border-b border-border space-y-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">
                {session?.title ?? "Session"}
              </span>
            </div>
            <select
              value={session?.status ?? "active"}
              disabled={updatingStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Session status"
              className={cn(
                "w-full rounded-md px-2.5 py-1.5 text-xs font-semibold border capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
                session?.status === "active"
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border",
              )}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {program && (
            <div className="p-4 border-b border-border">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                Target Program
              </p>
              <Link
                href={`/cyber/programs/${program.id}`}
                className="text-sm text-foreground hover:text-cyan-600 dark:hover:text-cyan-400 font-medium transition-colors"
              >
                {program.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                @{program.programHandle}
              </p>
            </div>
          )}

          <div className="p-4 flex-1 space-y-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Active Scope Gate
            </p>
            {inScope.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  In-Scope ({inScope.length})
                </p>
                {inScope.map((s) => (
                  <p
                    key={s.id}
                    className="text-xs text-foreground truncate font-mono py-0.5"
                    title={s.assetIdentifier}
                  >
                    {s.assetIdentifier}
                  </p>
                ))}
              </div>
            )}
            {outScope.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
                  Out-of-Scope ({outScope.length})
                </p>
                {outScope.map((s) => (
                  <p
                    key={s.id}
                    className="text-xs text-muted-foreground truncate font-mono py-0.5 line-through"
                    title={s.assetIdentifier}
                  >
                    {s.assetIdentifier}
                  </p>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div
          className={cn(
            "flex-col flex-1 min-w-0 min-h-0",
            mobilePane === "chat" ? "flex" : "hidden xl:flex",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card/40 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                Specialist Agent
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Specialist agent persona"
              className="flex items-center gap-1 flex-wrap"
            >
              {AGENT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={agentMode === m.id}
                  onClick={() => setAgentMode(m.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60",
                    agentMode === m.id
                      ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[88%] rounded-xl px-4 py-3 text-sm space-y-2",
                    msg.role === "user"
                      ? "bg-cyan-600/12 dark:bg-cyan-500/18 border border-cyan-500/30 text-foreground"
                      : msg.role === "system"
                        ? "bg-muted/70 border border-border text-muted-foreground text-xs max-w-full"
                        : msg.blocked
                          ? "bg-red-500/10 border border-red-500/30 text-foreground"
                          : "bg-card border border-border text-foreground",
                  )}
                >
                  {msg.agentLabel && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
                      {msg.blocked ? (
                        <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />
                      ) : (
                        <Shield className="size-3.5" />
                      )}
                      <span>{msg.agentLabel}</span>
                    </div>
                  )}

                  {msg.scopeChecks && msg.scopeChecks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.scopeChecks.map((sc, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border",
                            sc.isInScope
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
                          )}
                        >
                          {sc.isInScope ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <ShieldAlert className="size-3" />
                          )}
                          {sc.target}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground tabular-nums text-right">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {!hasUserMessages && session?.status === "active" && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-cyan-600 dark:text-cyan-400" />
                  Suggested starting prompts
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => dispatchCommand(prompt)}
                      className="text-left text-xs px-3 py-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-cyan-500/40 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="text-xs">
                      Running pre-flight scope gate &amp; consulting specialist
                      agent…
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              dispatchCommand(input);
            }}
            className="p-4 border-t border-border"
          >
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  session?.status === "active"
                    ? "Ask the specialist agent or evaluate an in-scope target…"
                    : "Session is not active — switch status to Active to dispatch commands"
                }
                disabled={sending || session?.status !== "active"}
                className="flex-1 bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-60 transition-colors"
              />
              <button
                type="submit"
                disabled={
                  sending || !input.trim() || session?.status !== "active"
                }
                aria-label="Send command"
                className="p-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </div>

        <aside
          className={cn(
            "flex-col w-full xl:w-68 shrink-0 border-l border-border bg-card/40",
            mobilePane === "findings" ? "flex xl:flex" : "hidden xl:flex",
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-foreground">
              Session Findings ({findings.length})
            </span>
            <button
              type="button"
              onClick={() => setShowAddFinding(true)}
              aria-label="Log finding"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/12 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-[11px] font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <Plus className="size-3" /> Log
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {findings.length === 0 ? (
              <div className="text-center py-8 px-2">
                <Bug className="size-6 text-muted-foreground mx-auto mb-2 opacity-60" />
                <p className="text-xs text-muted-foreground">No findings yet</p>
                <button
                  type="button"
                  onClick={() => setShowAddFinding(true)}
                  className="mt-2 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Log first finding
                </button>
              </div>
            ) : (
              findings.map((f) => (
                <Link
                  key={f.id}
                  href={`/cyber/findings/${f.id}`}
                  className="block p-3 rounded-lg bg-background border border-border hover:border-cyan-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {f.status}
                    </span>
                  </div>
                  <p className="text-xs text-foreground font-medium line-clamp-2">
                    {f.title}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                    <span>Inspect</span>
                    <ChevronRight className="size-3" />
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="p-3 border-t border-border">
            <Link
              href="/cyber/findings"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="size-3.5" /> View all findings
            </Link>
          </div>
        </aside>
      </div>

      {showAddFinding && sessionId && (
        <AddFindingDialog
          sessionId={sessionId}
          defaultAsset={inScope[0]?.assetIdentifier}
          onClose={() => setShowAddFinding(false)}
          onAdded={(f) => {
            setFindings((prev) => [f, ...prev]);
            setShowAddFinding(false);
          }}
        />
      )}
    </div>
  );
}
