"use client";

import {
  CyberDialog,
  CyberPageHeader,
  SeverityBadge,
  StatusBadge,
  TIER_LABELS,
  TIER_STYLES,
} from "@/components/cyber/cyber-ui";
import { Markdown } from "@/components/markdown";
import {
  FINDING_SCRIBE_AGENT_ID,
  SELF_LEARNING_E2B_MOUNT_PATH,
} from "lib/cyber/self-learning-utils";
import { cn } from "lib/utils";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Bug,
  Check,
  Download,
  Edit3,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Target,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CyberProfile = {
  accessTier: number;
  role: string;
  voidTrustScore: number;
  status: string;
};

type CyberQuotas = {
  planLabel: string;
  maxConcurrentAgents: number;
  maxActiveCyberSessions: number;
  runningAgents: number;
  activeCyberSessions: number;
};

type CyberFinding = {
  id: string;
  title: string;
  severity: string;
  status: string;
  affectedAsset: string;
  cvssScore: string | null;
  cweId: string | null;
  rawToolOutputs?: Record<string, unknown> | null;
  createdAt: string;
};

type CyberSession = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

type CyberLearningFile = {
  id: string;
  filename: string;
  contentMarkdown: string;
  entriesCount: number;
  lastLearnedSummary: string | null;
  updatedAt: string;
};

const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "low", "info"];

function QuickLogFindingModal({
  sessions,
  onClose,
  onCreated,
}: {
  sessions: CyberSession[];
  onClose: () => void;
  onCreated: (f: CyberFinding) => void;
}) {
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [proofOfConcept, setProofOfConcept] = useState("");
  const [impactDescription, setImpactDescription] = useState("");
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
          proofOfConcept: proofOfConcept || "# Documented from Cyber Dashboard",
          impactDescription: impactDescription || title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save finding");
        return;
      }
      onCreated(data.finding);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Log Bug to Recent Findings"
      description="Save a vulnerability directly into your Recent Findings panel for triage, verification, and disclosure reporting."
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
          placeholder="Vulnerability title *"
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
          rows={3}
          placeholder="Reproduction steps *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground resize-y"
        />
        <textarea
          value={proofOfConcept}
          onChange={(e) => setProofOfConcept(e.target.value)}
          rows={2}
          placeholder="Proof of Concept / curl payload (optional)"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground resize-y"
        />
        <input
          type="text"
          value={impactDescription}
          onChange={(e) => setImpactDescription(e.target.value)}
          placeholder="Impact summary (optional)"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
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

export default function CyberDashboardPage() {
  const [profile, setProfile] = useState<CyberProfile | null>(null);
  const [quotas, setQuotas] = useState<CyberQuotas | null>(null);
  const [findings, setFindings] = useState<CyberFinding[]>([]);
  const [sessions, setSessions] = useState<CyberSession[]>([]);
  const [programCount, setProgramCount] = useState(0);
  const [agentCount, setAgentCount] = useState(0);
  const [learningFile, setLearningFile] = useState<CyberLearningFile | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Recent Findings filter & modal
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showLogFinding, setShowLogFinding] = useState(false);

  // Self-learning file editor state
  const [editMode, setEditMode] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [savingFile, setSavingFile] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonTopic, setLessonTopic] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [tacticText, setTacticText] = useState("");
  const [addingLesson, setAddingLesson] = useState(false);
  const [resettingFile, setResettingFile] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, cfgRes, findRes, sessRes, progRes, agentRes, learnRes] =
        await Promise.all([
          fetch("/api/cyber/users/me"),
          fetch("/api/cyber/config"),
          fetch("/api/cyber/findings?limit=50"),
          fetch("/api/cyber/sessions?limit=10"),
          fetch("/api/cyber/programs?limit=50"),
          fetch("/api/cyber/agents"),
          fetch("/api/cyber/learning"),
        ]);

      if (profRes.ok) {
        const d = await profRes.json();
        setProfile(d.profile ?? null);
      }
      if (cfgRes.ok) {
        const d = await cfgRes.json();
        setQuotas(d.quotas ?? null);
      }
      if (findRes.ok) {
        const d = await findRes.json();
        setFindings(d.findings ?? []);
      }
      if (sessRes.ok) {
        const d = await sessRes.json();
        setSessions(d.sessions ?? []);
      }
      if (progRes.ok) {
        const d = await progRes.json();
        setProgramCount((d.programs ?? []).length);
      }
      if (agentRes.ok) {
        const d = await agentRes.json();
        setAgentCount((d.agents ?? []).length);
      }
      if (learnRes.ok) {
        const d = await learnRes.json();
        if (d.file) {
          setLearningFile(d.file);
          setDraftMarkdown(d.file.contentMarkdown ?? "");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSaveLearningFile() {
    setSavingFile(true);
    try {
      const res = await fetch("/api/cyber/learning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMarkdown: draftMarkdown }),
      });
      if (res.ok) {
        const d = await res.json();
        setLearningFile(d.file);
        setDraftMarkdown(d.file.contentMarkdown);
        setEditMode(false);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2500);
      }
    } finally {
      setSavingFile(false);
    }
  }

  async function handleAppendLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!lessonText.trim() && !tacticText.trim()) return;
    setAddingLesson(true);
    try {
      const res = await fetch("/api/cyber/learning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appendTopic: lessonTopic.trim() || "Bug Bounty Lesson",
          appendLesson: lessonText.trim(),
          appendTactic: tacticText.trim(),
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setLearningFile(d.file);
        setDraftMarkdown(d.file.contentMarkdown);
        setLessonTopic("");
        setLessonText("");
        setTacticText("");
        setShowAddLesson(false);
      }
    } finally {
      setAddingLesson(false);
    }
  }

  async function handleResetLearningFile() {
    setResettingFile(true);
    try {
      const res = await fetch("/api/cyber/learning", { method: "DELETE" });
      if (res.ok) {
        const d = await res.json();
        setLearningFile(d.file);
        setDraftMarkdown(d.file.contentMarkdown);
        setEditMode(false);
      }
    } finally {
      setResettingFile(false);
    }
  }

  const filteredFindings =
    severityFilter === "all"
      ? findings
      : findings.filter((f) => f.severity === severityFilter);

  const scribeCount = findings.filter(
    (f) => f.rawToolOutputs?.loggedBy === "finding-scribe",
  ).length;

  const isAdmin = (profile?.accessTier ?? 0) >= 3;

  if (loading) {
    return (
      <div className="p-6 max-w-6xl space-y-6">
        <div className="h-10 w-64 bg-muted/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-muted/60 rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <CyberPageHeader
        title="Void Cyber Dashboard"
        description="Recent bugs saved by Finding Scribe, your self-training agent playbook, active research sessions, and bug bounty workspace controls."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {profile && (
              <span
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-semibold border",
                  TIER_STYLES[profile.accessTier] ?? TIER_STYLES[1],
                )}
              >
                {TIER_LABELS[profile.accessTier] ??
                  `Tier ${profile.accessTier}`}
              </span>
            )}
            <Link
              href={`/cyber?agentId=${encodeURIComponent(FINDING_SCRIBE_AGENT_ID)}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Bug className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Open Finding Scribe
            </Link>
            <Link
              href="/cyber"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-colors"
            >
              <MessageSquare className="size-3.5" />
              Back to Cyber Chat
            </Link>
          </div>
        }
      />

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Recent Findings</span>
            <Bug className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {findings.length}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {scribeCount} auto-logged by Finding Scribe
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Self-Learned Entries</span>
            <BookOpen className="size-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {learningFile?.entriesCount ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {learningFile?.filename ?? "bugbounty-self-learning.md"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cyber Plan Limits</span>
            <Shield className="size-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {quotas
              ? `${quotas.runningAgents}/${quotas.maxConcurrentAgents}`
              : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {quotas
              ? `${quotas.planLabel} · Sessions ${quotas.activeCyberSessions}/${quotas.maxActiveCyberSessions}`
              : "Loading quotas"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Predefined Agents & Programs</span>
            <Bot className="size-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {agentCount + 1}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {programCount} prog
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Includes default Finding Scribe
          </p>
        </div>
      </div>

      {/* Main Split: Recent Findings Panel + Self-Learning Playbook Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* DEDICATED RECENT FINDINGS PANEL */}
        <section
          id="recent-findings"
          className="xl:col-span-7 bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border flex-wrap">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bug className="size-4 text-emerald-600 dark:text-emerald-400" />
                Recent Findings
              </h2>
              <p className="text-xs text-muted-foreground">
                Bugs automatically captured by the default{" "}
                <strong className="text-foreground font-medium">
                  Finding Scribe
                </strong>{" "}
                agent or logged manually.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLogFinding(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-colors"
              >
                <Plus className="size-3.5" />
                Log Bug
              </button>
              <Link
                href="/cyber/findings"
                className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
              >
                All
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>

          {/* Severity filter strip */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/70 bg-muted/20 overflow-x-auto">
            {SEVERITY_FILTERS.map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors shrink-0",
                  severityFilter === sev
                    ? "bg-background text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sev}
              </button>
            ))}
          </div>

          {filteredFindings.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-2">
              <Bug className="size-7 text-muted-foreground/60 mx-auto" />
              <p className="text-sm font-medium text-foreground">
                No findings saved yet
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                As you hunt bugs in{" "}
                <Link
                  href="/cyber"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Cyber Chat
                </Link>
                , the separate default Finding Scribe agent automatically saves
                discovered vulnerabilities right here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[540px] overflow-y-auto">
              {filteredFindings.map((f) => {
                const isScribe =
                  f.rawToolOutputs?.loggedBy === "finding-scribe";
                return (
                  <Link
                    key={f.id}
                    href={`/cyber/findings/${f.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={f.severity} />
                        <p className="text-sm font-medium text-foreground truncate">
                          {f.title}
                        </p>
                        {isScribe && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                            Finding Scribe
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        {f.affectedAsset}
                        {f.cweId ? ` · ${f.cweId}` : ""}
                        {f.cvssScore ? ` · CVSS ${f.cvssScore}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={f.status} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {new Date(f.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* BUG BOUNTY AGENT SELF-LEARNING FILE PANEL */}
        <section
          id="self-learning"
          className="xl:col-span-5 bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-border flex-wrap">
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground shrink-0" />
                Agent Self-Learning File
              </h2>
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {learningFile?.filename ?? "bugbounty-self-learning.md"} →{" "}
                {SELF_LEARNING_E2B_MOUNT_PATH}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddLesson((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 text-xs font-medium transition-colors"
                title="Add a manual training note to the self-learning file"
              >
                <Plus className="size-3.5" />
                Train
              </button>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent text-xs font-medium text-foreground border border-border transition-colors"
                title={editMode ? "Preview Markdown" : "Edit raw Markdown"}
              >
                {editMode ? (
                  <>
                    <Eye className="size-3.5" />
                    Preview
                  </>
                ) : (
                  <>
                    <Edit3 className="size-3.5" />
                    Edit
                  </>
                )}
              </button>
              <a
                href="/api/cyber/learning?download=1"
                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border transition-colors"
                title="Download bugbounty-self-learning.md"
                aria-label="Download self-learning markdown file"
              >
                <Download className="size-3.5" />
              </a>
            </div>
          </div>

          {showAddLesson && (
            <form
              onSubmit={handleAppendLesson}
              className="p-4 border-b border-border bg-muted/20 space-y-2.5"
            >
              <input
                type="text"
                value={lessonTopic}
                onChange={(e) => setLessonTopic(e.target.value)}
                placeholder="Topic (e.g. OAuth Redirect Bypass, GraphQL Introspection)"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
              />
              <textarea
                value={lessonText}
                onChange={(e) => setLessonText(e.target.value)}
                rows={2}
                placeholder="Lesson learned for future bug bounty runs…"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground resize-y"
              />
              <input
                type="text"
                value={tacticText}
                onChange={(e) => setTacticText(e.target.value)}
                placeholder="Optional working tactic / payload pattern"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddLesson(false)}
                  className="px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    addingLesson || (!lessonText.trim() && !tacticText.trim())
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 text-xs font-semibold disabled:opacity-60 transition-colors"
                >
                  {addingLesson ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Append to Self-File
                </button>
              </div>
            </form>
          )}

          <div className="p-4">
            {editMode ? (
              <div className="space-y-3">
                <textarea
                  value={draftMarkdown}
                  onChange={(e) => setDraftMarkdown(e.target.value)}
                  rows={16}
                  aria-label="Edit self-learning markdown file"
                  className="w-full bg-background border border-border rounded-lg p-3 text-xs font-mono text-foreground resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleResetLearningFile}
                    disabled={resettingFile}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset File
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLearningFile}
                    disabled={savingFile}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 text-xs font-semibold disabled:opacity-60 transition-colors"
                  >
                    {savingFile ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    Save File
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {savedNotice && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-xs">
                    <Check className="size-3.5" />
                    Self-learning playbook saved.
                  </div>
                )}
                <div className="max-h-[420px] overflow-y-auto rounded-lg bg-background border border-border p-3.5 text-xs leading-relaxed">
                  <Markdown>{learningFile?.contentMarkdown ?? ""}</Markdown>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Agents automatically read this self-file on every Cyber chat
                  turn and mount it inside E2B sandboxes on boot.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Extra Features Workspace Hub + Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Terminal className="size-4 text-cyan-600 dark:text-cyan-400" />
              Active Cyber Sessions
            </h2>
            <Link
              href="/cyber/sessions"
              className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
            >
              Manage
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No research sessions yet.{" "}
              <Link
                href="/cyber/sessions"
                className="text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                Start a dedicated session
              </Link>
              .
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.slice(0, 5).map((s) => (
                <Link
                  key={s.id}
                  href={`/cyber/sessions/${s.id}`}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <span className="text-xs font-medium text-foreground truncate">
                    {s.title}
                  </span>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Predefined Cyber Agents",
              desc: "Build reusable task-specific agents wired with E2B skills.",
              href: "/cyber/agents",
              icon: Bot,
            },
            {
              title: "Target Programs",
              desc: "Optional saved bug bounty programs with in-scope & out-of-scope rules.",
              href: "/cyber/programs",
              icon: Target,
            },
            {
              title: "Scope Checker",
              desc: "Deterministic pre-flight scope validator for URLs, domains, and CIDRs.",
              href: "/cyber/scope-checker",
              icon: Search,
            },
            {
              title: "Disclosure Reports",
              desc: "Compile findings into quality-scored HackerOne/Bugcrowd Markdown reports.",
              href: "/cyber/reports",
              icon: FileText,
            },
            ...(isAdmin
              ? [
                  {
                    title: "Owner Governance",
                    desc: "Control user roles, VoidTrust scores, plan limits, and E2B Git skills.",
                    href: "/cyber/admin/users",
                    icon: Users,
                  },
                  {
                    title: "Admin Audit Trail",
                    desc: "Admin-only behavioral audit log of scope checks and governance events.",
                    href: "/cyber/audit",
                    icon: Activity,
                  },
                ]
              : []),
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-card border border-border hover:border-cyan-500/40 rounded-xl p-4 flex items-start gap-3 transition-colors"
              >
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      </div>

      {showLogFinding && (
        <QuickLogFindingModal
          sessions={sessions}
          onClose={() => setShowLogFinding(false)}
          onCreated={(created) => {
            setShowLogFinding(false);
            setFindings((prev) => [created, ...prev]);
          }}
        />
      )}
    </div>
  );
}
