"use client";

import {
  CyberDialog,
  CyberPageHeader,
  CyberSkeletonTable,
} from "@/components/cyber/cyber-ui";
import { FINDING_SCRIBE_AGENT_ID } from "lib/cyber/self-learning-utils";
import { cn } from "lib/utils";
import {
  AlertCircle,
  Bot,
  Bug,
  CheckSquare,
  Cpu,
  Edit3,
  Loader2,
  MessageSquare,
  Plus,
  Shield,
  Square,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CyberAgent = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  skillSlugs: string[];
  sandboxEnabled: boolean;
  isShared: boolean;
  createdAt: string;
};

type BuiltinSkill = {
  slug: string;
  name: string;
  repoUrl: string;
  description: string;
  enabled: boolean;
};

function AgentFormDialog({
  skills,
  initial,
  onClose,
  onSaved,
}: {
  skills: BuiltinSkill[];
  initial?: CyberAgent | null;
  onClose: () => void;
  onSaved: (agent: CyberAgent) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(
    new Set(
      initial?.skillSlugs ?? skills.filter((s) => s.enabled).map((s) => s.slug),
    ),
  );
  const [sandboxEnabled, setSandboxEnabled] = useState(
    initial?.sandboxEnabled ?? true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSkill(slug: string) {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      setError("Name and agent instructions are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url = initial
        ? `/api/cyber/agents/${initial.id}`
        : "/api/cyber/agents";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim(),
          skillSlugs: Array.from(selectedSkills),
          sandboxEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save agent");
        return;
      }
      onSaved(data.agent);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title={initial ? "Edit Cyber Agent" : "Create Predefined Cyber Agent"}
      description="Configure a reusable specialist agent with task instructions and E2B sandbox skills."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Agent Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Cloudflare Workers Security Auditor"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Short Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What specific security task this agent owns"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Task Instructions / System Prompt *
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            required
            rows={5}
            placeholder="Describe how this agent should audit targets, analyze code, verify vulnerabilities, and structure findings..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 resize-y"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              E2B Built-in Skills to Hook on Boot
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={sandboxEnabled}
                onChange={(e) => setSandboxEnabled(e.target.checked)}
                className="rounded border-border"
              />
              Enable E2B Sandbox
            </label>
          </div>
          {skills.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No built-in cyber skills registered yet.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {skills.map((skill) => {
                const checked = selectedSkills.has(skill.slug);
                return (
                  <button
                    key={skill.slug}
                    type="button"
                    onClick={() => toggleSkill(skill.slug)}
                    className={cn(
                      "w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors",
                      checked
                        ? "bg-cyan-500/10 border-cyan-500/35"
                        : "bg-background border-border hover:border-muted-foreground/40",
                    )}
                  >
                    {checked ? (
                      <CheckSquare className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {skill.name}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        {skill.repoUrl}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            {submitting ? "Saving…" : initial ? "Save Changes" : "Create Agent"}
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

export default function CyberAgentsPage() {
  const [agents, setAgents] = useState<CyberAgent[]>([]);
  const [skills, setSkills] = useState<BuiltinSkill[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CyberAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/cyber/agents").then((r) => r.json()),
      fetch("/api/cyber/config").then((r) => r.json()),
      fetch("/api/cyber/users/me")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([agentData, cfgData, meData]) => {
        if (agentData.error) {
          setError(agentData.error);
          return;
        }
        setAgents(agentData.agents ?? []);
        setSkills(cfgData.config?.builtinSkills ?? []);
        setIsAdmin((meData?.profile?.accessTier ?? 0) >= 3);
      })
      .catch(() => setError("Failed to load predefined agents"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(agent: CyberAgent) {
    if (!window.confirm(`Delete predefined agent "${agent.name}"?`)) return;
    setDeletingId(agent.id);
    try {
      const res = await fetch(`/api/cyber/agents/${agent.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Predefined Cyber Agents"
        description="Build custom specialist agents for recurring security audits, bound to E2B sandbox skills like Cloudflare Security Audit."
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> New Cyber Agent
          </button>
        }
      />

      {loading && <CyberSkeletonTable rows={4} />}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Built-in Default Cyber Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                name: "Void Cyber (Auto)",
                description:
                  "Default self-improving Void Cyber bug bounty & security audit agent with automatic skill hooking.",
                href: "/cyber",
                icon: Shield,
              },
              {
                name: "Finding Scribe (Bug Logger)",
                description:
                  "Dedicated default bug logger that structures CVSS/CWE/PoC findings and saves them straight to Recent Findings.",
                href: `/cyber?agentId=${encodeURIComponent(FINDING_SCRIBE_AGENT_ID)}`,
                icon: Bug,
              },
            ].map((builtin) => {
              const Icon = builtin.icon;
              return (
                <div
                  key={builtin.name}
                  className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/20 shrink-0">
                          <Icon className="size-4 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <h3 className="font-semibold text-sm text-foreground truncate">
                          {builtin.name}
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25 shrink-0">
                        Built-in
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {builtin.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                    <Link
                      href={builtin.href}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition-colors"
                    >
                      <MessageSquare className="size-3.5" /> Use in Chat
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/cyber/admin/users?tab=agents"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Edit3 className="size-3.5" /> Edit Prompt
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Bot className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No predefined Cyber Agents yet
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            Create reusable specialist agents for specific security workflows
            (e.g., Cloudflare security audits, API auth reviews, smart-contract
            checks) and invoke them directly inside Cyber Chat.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Create First Agent
          </button>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/40 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/20 shrink-0">
                      <Bot className="size-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <h2 className="font-semibold text-sm text-foreground truncate">
                      {agent.name}
                    </h2>
                  </div>
                  {agent.sandboxEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                      <Cpu className="size-3" /> E2B
                    </span>
                  )}
                </div>

                {agent.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {agent.description}
                  </p>
                )}

                <p className="text-xs text-muted-foreground/80 line-clamp-2 font-mono bg-muted/40 rounded-lg p-2 border border-border/60">
                  {agent.systemPrompt}
                </p>

                {Array.isArray(agent.skillSlugs) &&
                  agent.skillSlugs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {agent.skillSlugs.map((slug) => (
                        <span
                          key={slug}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25"
                        >
                          {slug}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                <Link
                  href={`/cyber?agentId=${agent.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition-colors"
                >
                  <MessageSquare className="size-3.5" /> Use in Chat
                </Link>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(agent)}
                    aria-label={`Edit ${agent.name}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Edit3 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(agent)}
                    disabled={deletingId === agent.id}
                    aria-label={`Delete ${agent.name}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === agent.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <AgentFormDialog
          skills={skills}
          initial={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setAgents((prev) => {
              const exists = prev.some((a) => a.id === saved.id);
              return exists
                ? prev.map((a) => (a.id === saved.id ? saved : a))
                : [saved, ...prev];
            });
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
