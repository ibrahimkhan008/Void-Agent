"use client";

import { CyberAccessLocked } from "@/components/cyber/cyber-access-locked";
import { CyberCopyButton, CyberDialog } from "@/components/cyber/cyber-ui";
import { Markdown } from "@/components/markdown";
import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FINDING_SCRIBE_AGENT_ID } from "lib/cyber/self-learning-utils";
import { cn } from "lib/utils";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Bot,
  Bug,
  CheckCircle2,
  ChevronDown,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  Shield,
  ShieldAlert,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

type CyberProfile = {
  accessTier: number;
  role: string;
  voidTrustScore: number;
  status: string;
};

type CyberProgram = {
  id: string;
  name: string;
  programHandle: string;
};

type CyberAgent = {
  id: string;
  name: string;
  description: string | null;
};

type CyberQuotas = {
  planLabel: string;
  maxConcurrentAgents: number;
  maxActiveCyberSessions: number;
  runningAgents: number;
  activeCyberSessions: number;
};

type CyberSession = {
  id: string;
  title: string;
  status: string;
};

type ScopeCheckBadge = {
  target: string;
  status: string;
  isInScope: boolean;
  reason: string;
};

type TurnAutomation = {
  learnedAdded: boolean;
  learnedSummary: string | null;
  learningEntriesCount: number;
  savedFindings: Array<{
    id: string;
    title: string;
    severity: string;
    affectedAsset: string;
  }>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  agentLabel?: string;
  programName?: string | null;
  blocked?: boolean;
  scopeChecks?: ScopeCheckBadge[];
  automation?: TurnAutomation;
};

const QUICK_PROMPTS = [
  {
    label: "Run a security audit",
    prompt:
      "Run a comprehensive security audit checklist for our edge, authentication, and API surface with minimal-impact verification steps.",
  },
  {
    label: "Hunt bugs on an API or repo",
    prompt:
      "Help me hunt for authorization bypasses, IDOR/BOLA, SSRF, and injection flaws in our REST & GraphQL APIs with minimal-impact verification steps.",
  },
  {
    label: "Save a bug via Finding Scribe",
    prompt:
      "Document and save this vulnerability into Recent Findings with CVSS severity, reproduction steps, PoC, impact, and remediation guidance.",
  },
];

function LogFindingFromChatModal({
  sessions,
  initialNotes,
  onClose,
  onCreated,
}: {
  sessions: CyberSession[];
  initialNotes: string;
  onClose: () => void;
  onCreated: (findingId: string) => void;
}) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState(
    initialNotes.slice(0, 1500),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cyber/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || null,
          title,
          severity,
          affectedAsset,
          reproductionSteps,
          proofOfConcept: "# Documented from Void Cyber Chat",
          impactDescription: title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to log finding");
        return;
      }
      onCreated(data.finding.id);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Save to Recent Findings"
      description="Log this bug directly to the Recent Findings panel in your Cyber Dashboard."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {sessions.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Research Session (optional)
            </label>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              <option value="">Standalone / Free-form finding</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Bug / finding title *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Severity"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
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
            placeholder="Affected asset / endpoint *"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <textarea
          value={reproductionSteps}
          onChange={(e) => setReproductionSteps(e.target.value)}
          required
          rows={4}
          placeholder="Notes / reproduction steps *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground resize-y"
        />
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs">
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
          {submitting ? "Saving…" : "Save to Recent Findings"}
        </button>
      </form>
    </CyberDialog>
  );
}

function VoidCyberChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAgentId = searchParams.get("agentId") ?? "";

  const [profile, setProfile] = useState<CyberProfile | null>(null);
  const [programs, setPrograms] = useState<CyberProgram[]>([]);
  const [customAgents, setCustomAgents] = useState<CyberAgent[]>([]);
  const [quotas, setQuotas] = useState<CyberQuotas | null>(null);
  const [sessions, setSessions] = useState<CyberSession[]>([]);
  const [recentFindingsCount, setRecentFindingsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Chat state (sandboxId is tracked silently — server auto-boots E2B on first message)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] =
    useState<string>(initialAgentId);
  const [autoLearnAndLog, setAutoLearnAndLog] = useState(true);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [findingDraft, setFindingDraft] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialAgentId) setSelectedAgentId(initialAgentId);
  }, [initialAgentId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const profRes = await fetch("/api/cyber/users/me");
        if (profRes.status === 401 || profRes.status === 403) {
          setAccessDenied(true);
          return;
        }
        if (!profRes.ok) {
          setUnavailable(true);
          return;
        }
        const profData = await profRes.json();
        const userProfile = profData.profile ?? null;
        setProfile(userProfile);

        if (!userProfile || userProfile.status !== "active") {
          setAccessDenied(true);
          return;
        }

        const [progRes, agentRes, cfgRes, sessRes, findRes] = await Promise.all(
          [
            fetch("/api/cyber/programs?limit=50"),
            fetch("/api/cyber/agents"),
            fetch("/api/cyber/config"),
            fetch("/api/cyber/sessions?limit=10"),
            fetch("/api/cyber/findings?limit=50"),
          ],
        );

        if (progRes.ok) {
          const d = await progRes.json();
          setPrograms(d.programs ?? []);
        }
        if (agentRes.ok) {
          const d = await agentRes.json();
          setCustomAgents(d.agents ?? []);
        }
        if (cfgRes.ok) {
          const d = await cfgRes.json();
          setQuotas(d.quotas ?? null);
        }
        if (sessRes.ok) {
          const d = await sessRes.json();
          setSessions(d.sessions ?? []);
        }
        if (findRes.ok) {
          const d = await findRes.json();
          setRecentFindingsCount((d.findings ?? []).length);
        }
      } catch {
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const selectedAgent = customAgents.find((a) => a.id === selectedAgentId);
  const isFindingScribeSelected = selectedAgentId === FINDING_SCRIBE_AGENT_ID;

  async function sendPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const history = messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/cyber/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          customAgentId: selectedAgentId || null,
          programId: selectedProgramId || null,
          sandboxId,
          autoLearnAndLog,
          history,
        }),
      });
      const data = await res.json();

      // Silently store auto-booted sandboxId for follow-up turns
      if (typeof data.sandboxId === "string" && data.sandboxId) {
        setSandboxId(data.sandboxId);
      }

      const automation = data.automation as TurnAutomation | undefined;
      if (automation?.savedFindings?.length) {
        setRecentFindingsCount((c) => c + automation.savedFindings.length);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response ?? data.error ?? "No response returned.",
          timestamp: new Date().toISOString(),
          agentLabel: data.agentLabel,
          programName: data.programName,
          blocked: Boolean(data.blocked),
          scopeChecks: data.scopeChecks,
          automation,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Network error while contacting Void Cyber.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(input);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[70vh] px-4">
        <div className="w-full max-w-3xl space-y-5">
          <div className="h-10 w-80 mx-auto bg-muted/60 rounded-xl animate-pulse" />
          <div className="h-32 w-full bg-muted/60 rounded-[24px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (unavailable || accessDenied || !profile) {
    return (
      <CyberAccessLocked
        reason={
          unavailable && !profile
            ? "unavailable"
            : profile && profile.status !== "active"
              ? "inactive"
              : "none"
        }
        status={profile?.status}
      />
    );
  }

  const isEmpty = messages.length === 0;

  // Signature Void Agent floating composer matching "/" and "/cloud-agent"
  const composerElement = (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="rounded-[25px] bg-muted/40 p-1.5">
        <div className="shadow-[0_0.83px_1.67px_rgba(0,0,0,0.4)] overflow-hidden rounded-[18px] transition-all duration-200 bg-card relative flex w-full flex-col z-10 items-stretch ring-1 ring-border focus-within:ring-cyan-500/50">
          {selectedProgram && (
            <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-emerald-500/8 border-b border-emerald-500/20 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-medium text-emerald-700 dark:text-emerald-400 truncate">
                  Scope Attached: {selectedProgram.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProgramId("")}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          <div className="px-4 pt-3.5 pb-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={
                isFindingScribeSelected
                  ? "Describe the bug you found — Finding Scribe will structure and save it to Recent Findings…"
                  : selectedAgent
                    ? `Ask ${selectedAgent.name} — describe any target, repo, or security task…`
                    : "Tell Void Cyber what target, repo, or bug bounty task to work on…"
              }
              disabled={sending}
              aria-label="Message Void Cyber"
              className="w-full resize-none bg-transparent text-sm sm:text-[15px] text-foreground placeholder:text-muted-foreground/75 focus:outline-none leading-relaxed max-h-[180px]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Cyber Agent Selector */}
              <div className="relative inline-flex items-center">
                <Bot className="size-3.5 text-cyan-600 dark:text-cyan-400 absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedAgentId}
                  onChange={(e) => {
                    if (e.target.value === "__create__") {
                      router.push("/cyber/agents");
                      return;
                    }
                    setSelectedAgentId(e.target.value);
                  }}
                  aria-label="Cyber Agent"
                  className="appearance-none h-8 rounded-full pl-7 pr-6 text-xs font-medium bg-cyan-500/10 border border-cyan-500/25 text-cyan-700 dark:text-cyan-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                >
                  <option value="">Void Cyber (Auto)</option>
                  <option value={FINDING_SCRIBE_AGENT_ID}>
                    Finding Scribe (Bug Logger)
                  </option>
                  {customAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="__create__">+ Create Predefined Agent…</option>
                </select>
                <ChevronDown className="size-3 text-cyan-600 dark:text-cyan-400 absolute right-2 pointer-events-none" />
              </div>

              {/* Optional Saved Program Scope */}
              {programs.length > 0 && (
                <div className="relative inline-flex items-center">
                  <Target
                    className={cn(
                      "size-3.5 absolute left-2.5 pointer-events-none",
                      selectedProgram
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  />
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    aria-label="Optional target program scope"
                    className={cn(
                      "appearance-none h-8 rounded-full pl-7 pr-6 text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
                      selectedProgram
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted/60 border-border/80 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <option value="">Target from chat</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        Scope: {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="size-3 text-muted-foreground absolute right-2 pointer-events-none" />
                </div>
              )}

              {/* Self-Learn & Finding Scribe Toggle */}
              <button
                type="button"
                onClick={() => setAutoLearnAndLog((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition-colors",
                  autoLearnAndLog
                    ? "bg-foreground/8 border-foreground/20 text-foreground"
                    : "bg-muted/60 border-border/80 text-muted-foreground hover:text-foreground",
                )}
                title="Automatically train your self-learning playbook and save discovered bugs via Finding Scribe to Recent Findings"
              >
                <BookOpen className="size-3.5" />
                <span>Self-Learn: {autoLearnAndLog ? "On" : "Off"}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {!isEmpty && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setSandboxId(null);
                  }}
                  disabled={sending}
                  title="New cyber chat"
                  className="inline-flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => sendPrompt(input)}
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="inline-flex items-center justify-center size-8 rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-35 transition-opacity"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] w-full">
      {/* Pure Default Cyber Chat — identical layout to "/" and "/cloud-agent" */}
      <div className="flex-1 flex flex-col min-h-0">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
            <div className="min-h-32 max-w-3xl mx-auto mb-8 flex flex-col items-center gap-4 text-center">
              <Eyebrow>Void Cyber</Eyebrow>
              <h1 className="text-[36px] leading-[1.04] font-normal tracking-[-0.035em] text-balance sm:text-[44px] lg:text-[56px] text-foreground">
                What are we <AccentSpan>securing</AccentSpan> today?
              </h1>
              <p className="text-lg/[1.55] text-foreground/60 max-w-[560px]">
                Describe any target, repo, or bug bounty task — agents
                self-train as they work and Finding Scribe saves discovered
                bugs.
              </p>
            </div>

            {composerElement}

            <div className="w-full max-w-3xl px-4 mt-5 flex flex-wrap items-center justify-center gap-2">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => sendPrompt(item.prompt)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <Link
                href="/cyber/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-card hover:bg-accent text-foreground border border-border transition-colors"
              >
                <LayoutDashboard className="size-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Cyber Dashboard</span>
                {recentFindingsCount > 0 && (
                  <span className="px-1.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 text-[10px] font-semibold tabular-nums">
                    {recentFindingsCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto w-full max-w-3xl space-y-6">
                <div className="flex items-center justify-end gap-2">
                  {quotas && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/70 tabular-nums">
                      {quotas.planLabel} · Agents {quotas.runningAgents}/
                      {quotas.maxConcurrentAgents}
                    </span>
                  )}
                  <Link
                    href="/cyber/dashboard"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-card hover:bg-accent text-foreground border border-border transition-colors"
                  >
                    <LayoutDashboard className="size-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Dashboard</span>
                    {recentFindingsCount > 0 && (
                      <span className="px-1.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 text-[10px] font-semibold tabular-nums">
                        {recentFindingsCount}
                      </span>
                    )}
                  </Link>
                </div>

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col gap-1.5",
                      msg.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    {msg.role === "user" ? (
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="w-full space-y-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            {msg.blocked ? (
                              <ShieldAlert className="size-3.5 text-red-500" />
                            ) : (
                              <Shield className="size-3.5 text-cyan-600 dark:text-cyan-400" />
                            )}
                            {msg.agentLabel ?? "Void Cyber"}
                          </span>
                          {msg.programName && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                              {msg.programName}
                            </span>
                          )}
                          {msg.scopeChecks && msg.scopeChecks.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {msg.scopeChecks.map((sc) => (
                                <span
                                  key={sc.target}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border",
                                    sc.isInScope
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                                      : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
                                  )}
                                  title={sc.reason}
                                >
                                  {sc.isInScope ? (
                                    <CheckCircle2 className="size-2.5" />
                                  ) : (
                                    <ShieldAlert className="size-2.5" />
                                  )}
                                  {sc.target}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3.5 text-sm leading-relaxed border",
                            msg.blocked
                              ? "bg-red-500/8 border-red-500/30 text-foreground"
                              : "bg-card/80 border-border text-foreground",
                          )}
                        >
                          <Markdown>{msg.content}</Markdown>
                        </div>

                        {/* Live Self-Learning & Finding Scribe Automation Chips */}
                        {msg.automation &&
                          (msg.automation.learnedAdded ||
                            msg.automation.savedFindings.length > 0) && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {msg.automation.learnedAdded && (
                                <Link
                                  href="/cyber/dashboard#self-learning"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border hover:bg-accent transition-colors"
                                  title={
                                    msg.automation.learnedSummary ?? undefined
                                  }
                                >
                                  <BookOpen className="size-3" />
                                  Self-trained → bugbounty-self-learning.md
                                </Link>
                              )}
                              {msg.automation.savedFindings.length > 0 && (
                                <Link
                                  href="/cyber/dashboard#recent-findings"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/15 transition-colors"
                                >
                                  <Bug className="size-3" />
                                  Finding Scribe saved{" "}
                                  {msg.automation.savedFindings.length} bug
                                  {msg.automation.savedFindings.length === 1
                                    ? ""
                                    : "s"}{" "}
                                  → Recent Findings
                                </Link>
                              )}
                            </div>
                          )}

                        {!msg.blocked && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <CyberCopyButton value={msg.content} label="Copy" />
                            <button
                              type="button"
                              onClick={() => setFindingDraft(msg.content)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground border border-border transition-colors"
                            >
                              <Bug className="size-3" />
                              Save to Recent Findings
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {sending && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin text-cyan-600 dark:text-cyan-400" />
                    <span>
                      {isFindingScribeSelected
                        ? "Finding Scribe is structuring & saving findings…"
                        : selectedAgent
                          ? `${selectedAgent.name} is working…`
                          : "Void Cyber is analyzing…"}
                    </span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="sticky bottom-0 z-20 pt-2 pb-4 bg-gradient-to-t from-background via-background/95 to-transparent">
              {composerElement}
            </div>
          </>
        )}
      </div>

      {findingDraft && (
        <LogFindingFromChatModal
          sessions={sessions}
          initialNotes={findingDraft}
          onClose={() => setFindingDraft(null)}
          onCreated={(id) => {
            setFindingDraft(null);
            setRecentFindingsCount((c) => c + 1);
            router.push(`/cyber/findings/${id}`);
          }}
        />
      )}
    </div>
  );
}

export default function VoidCyberHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-full min-h-[70vh] px-4">
          <div className="w-full max-w-3xl space-y-5">
            <div className="h-10 w-80 mx-auto bg-muted/60 rounded-xl animate-pulse" />
            <div className="h-32 w-full bg-muted/60 rounded-[24px] animate-pulse" />
          </div>
        </div>
      }
    >
      <VoidCyberChatInner />
    </Suspense>
  );
}
