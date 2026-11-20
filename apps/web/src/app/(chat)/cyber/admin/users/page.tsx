"use client";

import { CyberDefaultAgentEditor } from "@/components/cyber/cyber-default-agent-editor";
import {
  CyberDialog,
  CyberPageHeader,
  CyberSkeletonTable,
  StatusBadge,
  TIER_LABELS,
  TIER_STYLES,
} from "@/components/cyber/cyber-ui";
import {
  type CyberDefaultAgentConfig,
  DEFAULT_CYBER_AUTO_AGENT,
  DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
  DEFAULT_FINDING_SCRIBE_AGENT,
} from "lib/cyber/default-agent-types";
import { cn } from "lib/utils";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Edit3,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Shield,
  Sliders,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Researcher = {
  userId: string;
  email: string | null;
  name: string | null;
  subscriptionTier: string | null;
  accessTier: number;
  role: string;
  status: string;
  voidTrustScore: number;
  mfaEnforced: boolean;
  maxConcurrentAgents: number | null;
  maxActiveSessions: number | null;
  createdAt: string;
};

type PlanInfo = { id: string; label: string; description: string };
type PlanQuota = {
  maxConcurrentAgents: number;
  maxActiveCyberSessions: number;
};
type BuiltinSkill = {
  slug: string;
  name: string;
  repoUrl: string;
  description: string;
  enabled: boolean;
  mountPath: string;
};

function GrantAccessModal({
  onClose,
  onGranted,
}: {
  onClose: () => void;
  onGranted: (r: Researcher) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [accessTier, setAccessTier] = useState(2);
  const [role, setRole] = useState("researcher");
  const [voidTrustScore, setVoidTrustScore] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/cyber/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          accessTier,
          role: role.trim() || "researcher",
          voidTrustScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to grant access");
        return;
      }
      onGranted({
        ...data.researcher,
        subscriptionTier: data.researcher.subscriptionTier ?? "free",
        maxConcurrentAgents: data.researcher.maxConcurrentAgents ?? null,
        maxActiveSessions: data.researcher.maxActiveSessions ?? null,
      });
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Grant Cyber Access"
      description="Authorize an internal user by email or UUID and set their initial role and VoidTrust score."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            User Email or UUID *
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            placeholder="researcher@company.com or user UUID"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Access Tier
            </label>
            <div className="relative">
              <select
                value={accessTier}
                onChange={(e) => setAccessTier(Number(e.target.value))}
                className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pr-8"
              >
                {[1, 2, 3].map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Role
            </label>
            <input
              type="text"
              list="cyber-role-presets"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="researcher, auditor, admin…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Initial VoidTrust Score (0 – 1000)
          </label>
          <input
            type="number"
            min={0}
            max={1000}
            value={voidTrustScore}
            onChange={(e) => setVoidTrustScore(Number(e.target.value) || 0)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm tabular-nums text-foreground"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !identifier.trim()}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Shield className="size-4" />
          )}
          {submitting ? "Granting…" : "Grant Access"}
        </button>
      </form>
    </CyberDialog>
  );
}

function EditResearcherModal({
  researcher,
  onClose,
  onSaved,
}: {
  researcher: Researcher;
  onClose: () => void;
  onSaved: (updated: Researcher) => void;
}) {
  const [role, setRole] = useState(researcher.role);
  const [accessTier, setAccessTier] = useState(researcher.accessTier);
  const [voidTrustScore, setVoidTrustScore] = useState(
    researcher.voidTrustScore,
  );
  const [status, setStatus] = useState(researcher.status);
  const [maxAgents, setMaxAgents] = useState(
    researcher.maxConcurrentAgents?.toString() ?? "",
  );
  const [maxSessions, setMaxSessions] = useState(
    researcher.maxActiveSessions?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cyber/users/${researcher.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: role.trim() || researcher.role,
          accessTier,
          voidTrustScore: Math.min(1000, Math.max(0, Number(voidTrustScore))),
          status,
          maxConcurrentAgents: maxAgents.trim() ? Number(maxAgents) : null,
          maxActiveSessions: maxSessions.trim() ? Number(maxSessions) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update researcher");
        return;
      }
      onSaved({ ...researcher, ...data.researcher });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CyberDialog
      title={`Edit Researcher — ${researcher.name || researcher.email || researcher.userId.slice(0, 8)}`}
      description="Modify role, access tier, VoidTrust score, status, and optional per-user quota overrides."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Role (editable)
            </label>
            <input
              type="text"
              list="cyber-role-presets"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Access Tier
            </label>
            <select
              value={accessTier}
              onChange={(e) => setAccessTier(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              {[1, 2, 3].map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              VoidTrust (0 – 1000)
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={voidTrustScore}
              onChange={(e) => setVoidTrustScore(Number(e.target.value) || 0)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm tabular-nums text-foreground"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-border space-y-3">
          <p className="text-xs font-semibold text-foreground">
            Per-User Cyber Quota Overrides (leave blank to inherit plan limit)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Max Concurrent Agents
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={maxAgents}
                onChange={(e) => setMaxAgents(e.target.value)}
                placeholder="Inherit plan"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Max Active Sessions
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={maxSessions}
                onChange={(e) => setMaxSessions(e.target.value)}
                placeholder="Inherit plan"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
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
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? "Saving…" : "Save Changes"}
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

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<
    "users" | "quotas" | "skills" | "agents"
  >("users");
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planLimits, setPlanLimits] = useState<Record<string, PlanQuota>>({});
  const [skills, setSkills] = useState<BuiltinSkill[]>([]);
  const [autoBootSandbox, setAutoBootSandbox] = useState(true);
  const [e2bConfigured, setE2bConfigured] = useState(false);
  const [agentSubTab, setAgentSubTab] = useState<"auto" | "scribe" | "new">(
    "auto",
  );
  const [defaultAutoAgent, setDefaultAutoAgent] =
    useState<CyberDefaultAgentConfig>(DEFAULT_CYBER_AUTO_AGENT);
  const [findingScribeAgent, setFindingScribeAgent] =
    useState<CyberDefaultAgentConfig>(DEFAULT_FINDING_SCRIBE_AGENT);
  const [factoryDefaultAgents, setFactoryDefaultAgents] = useState<{
    defaultAutoAgent: CyberDefaultAgentConfig;
    findingScribeAgent: CyberDefaultAgentConfig;
  }>({
    defaultAutoAgent: DEFAULT_CYBER_AUTO_AGENT,
    findingScribeAgent: DEFAULT_FINDING_SCRIBE_AGENT,
  });
  const [newCyberAgentDraft, setNewCyberAgentDraft] =
    useState<CyberDefaultAgentConfig>({
      name: "",
      description: "",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
        style: { backgroundColor: "rgb(8, 145, 178)" },
      },
      systemPrompt: "",
      mandatorySystemPrompt: DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
      mentions: [],
      model: null,
      knowledgeBases: [],
    });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [editingUser, setEditingUser] = useState<Researcher | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // New skill form
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillUrl, setNewSkillUrl] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, cfgRes] = await Promise.all([
        fetch("/api/cyber/users"),
        fetch("/api/cyber/config"),
      ]);
      if (!usersRes.ok) {
        const d = await usersRes.json().catch(() => ({}));
        setError(d.error ?? "Admin access required");
        return;
      }
      const uData = await usersRes.json();
      setResearchers(uData.researchers ?? []);

      if (cfgRes.ok) {
        const cData = await cfgRes.json();
        setPlans(cData.plans ?? []);
        setPlanLimits(cData.config?.planLimits ?? {});
        setSkills(cData.config?.builtinSkills ?? []);
        setAutoBootSandbox(Boolean(cData.config?.autoBootSandbox ?? true));
        if (cData.config?.defaultAutoAgent) {
          setDefaultAutoAgent(cData.config.defaultAutoAgent);
        }
        if (cData.config?.findingScribeAgent) {
          setFindingScribeAgent(cData.config.findingScribeAgent);
        }
        if (cData.factoryDefaultAgents) {
          setFactoryDefaultAgents(cData.factoryDefaultAgents);
        }
        setE2bConfigured(Boolean(cData.e2bConfigured));
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (
      tabParam === "users" ||
      tabParam === "quotas" ||
      tabParam === "skills" ||
      tabParam === "agents"
    ) {
      setActiveTab(tabParam);
    }
    loadAll();
  }, [loadAll]);

  async function toggleStatus(researcher: Researcher) {
    const newStatus = researcher.status === "active" ? "suspended" : "active";
    setUpdatingId(researcher.userId);
    try {
      const res = await fetch(`/api/cyber/users/${researcher.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setResearchers((prev) =>
          prev.map((r) =>
            r.userId === researcher.userId ? { ...r, status: newStatus } : r,
          ),
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteUser(researcher: Researcher) {
    const label = researcher.email || researcher.name || researcher.userId;
    if (
      !window.confirm(
        `Remove Void Cyber access and delete profile for "${label}"?`,
      )
    ) {
      return;
    }
    setUpdatingId(researcher.userId);
    try {
      const res = await fetch(`/api/cyber/users/${researcher.userId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResearchers((prev) =>
          prev.filter((r) => r.userId !== researcher.userId),
        );
      } else {
        setError(data.error ?? "Could not delete researcher");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function persistCyberConfig(
    nextLimits = planLimits,
    nextSkills = skills,
    nextAutoBoot = autoBootSandbox,
    notice = "Cyber configuration saved.",
    nextAutoAgent = defaultAutoAgent,
    nextScribeAgent = findingScribeAgent,
  ) {
    setSavingConfig(true);
    setSavedNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/cyber/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planLimits: nextLimits,
          builtinSkills: nextSkills,
          autoBootSandbox: nextAutoBoot,
          defaultAutoAgent: nextAutoAgent,
          findingScribeAgent: nextScribeAgent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save configuration");
        return;
      }
      setPlanLimits(data.config.planLimits);
      setSkills(data.config.builtinSkills);
      setAutoBootSandbox(data.config.autoBootSandbox);
      if (data.config.defaultAutoAgent) {
        setDefaultAutoAgent(data.config.defaultAutoAgent);
      }
      if (data.config.findingScribeAgent) {
        setFindingScribeAgent(data.config.findingScribeAgent);
      }
      setSavedNotice(notice);
      setTimeout(() => setSavedNotice(null), 3000);
    } catch {
      setError("Network error while saving configuration");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCreateCyberAgentFromAdmin(
    draft: CyberDefaultAgentConfig,
  ) {
    setSavingConfig(true);
    setSavedNotice(null);
    setError(null);
    try {
      const combinedPrompt = [
        draft.mandatorySystemPrompt.trim(),
        "",
        draft.systemPrompt.trim(),
      ].join("\n");
      const res = await fetch("/api/cyber/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          systemPrompt: combinedPrompt,
          skillSlugs: skills.filter((s) => s.enabled).map((s) => s.slug),
          sandboxEnabled: true,
          isShared: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create Cyber agent");
        return;
      }
      setNewCyberAgentDraft({
        name: "",
        description: "",
        icon: {
          type: "emoji",
          value:
            "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png",
          style: { backgroundColor: "rgb(8, 145, 178)" },
        },
        systemPrompt: "",
        mandatorySystemPrompt: DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
        mentions: [],
        model: null,
        knowledgeBases: [],
      });
      setSavedNotice(
        `Created shared Cyber agent "${data.agent?.name ?? draft.name}" — now visible in /agents and /cyber.`,
      );
      setTimeout(() => setSavedNotice(null), 4000);
    } catch {
      setError("Network error while creating Cyber agent");
    } finally {
      setSavingConfig(false);
    }
  }

  function handleAddSkill(e: React.FormEvent) {
    e.preventDefault();
    if (!newSkillUrl.trim()) return;
    const inferredName =
      newSkillName.trim() ||
      newSkillUrl
        .trim()
        .split("/")
        .pop()
        ?.replace(/\.git$/i, "") ||
      "Cyber Skill";
    const slug = inferredName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const next = [
      ...skills,
      {
        slug,
        name: inferredName,
        repoUrl: newSkillUrl.trim(),
        description:
          newSkillDesc.trim() ||
          "Automatically cloned and hooked into Void Cyber E2B sandbox on boot.",
        enabled: true,
        mountPath: `/home/user/skills/${slug}`,
      },
    ];
    setNewSkillName("");
    setNewSkillUrl("");
    setNewSkillDesc("");
    persistCyberConfig(
      planLimits,
      next,
      autoBootSandbox,
      `Added E2B skill "${inferredName}".`,
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <datalist id="cyber-role-presets">
        <option value="researcher" />
        <option value="auditor" />
        <option value="lead-researcher" />
        <option value="admin" />
      </datalist>

      <CyberPageHeader
        title="Owner Governance & Cyber Controls"
        description="Manage researcher roles, VoidTrust scores, suspend/activate/delete access, per-plan agent & session limits, and E2B built-in skills."
        actions={
          <button
            type="button"
            onClick={() => setShowGrant(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Grant Access
          </button>
        }
      />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Governance sections"
        className="flex items-center gap-2 border-b border-border flex-wrap"
      >
        {(
          [
            {
              id: "users",
              label: `Users & Trust (${researchers.length})`,
              icon: Users,
            },
            { id: "quotas", label: "Plan Limits", icon: Sliders },
            {
              id: "skills",
              label: `E2B Built-in Skills (${skills.length})`,
              icon: Cpu,
            },
            {
              id: "agents",
              label: "Default Agents",
              icon: Bot,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-cyan-500 text-cyan-700 dark:text-cyan-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {savedNotice && (
        <div
          role="status"
          className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm"
        >
          <Check className="size-4 shrink-0" />
          {savedNotice}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading && <CyberSkeletonTable rows={4} />}

      {/* TAB 1: USERS */}
      {!loading && activeTab === "users" && (
        <>
          {researchers.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
              <Users className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
              <h2 className="text-base font-semibold text-foreground mb-1">
                No researchers provisioned
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                Grant access to internal researchers and security engineers.
              </p>
              <button
                type="button"
                onClick={() => setShowGrant(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
              >
                <Plus className="size-4" /> Grant First Access
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      "Researcher",
                      "Role",
                      "Tier",
                      "VoidTrust",
                      "Cyber Limits",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {researchers.map((r) => (
                    <tr
                      key={r.userId}
                      className="border-b border-border last:border-0 hover:bg-accent/35 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {r.name || r.email || r.userId.slice(0, 12)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.email ?? r.userId} ·{" "}
                          <span className="capitalize">
                            {r.subscriptionTier ?? "free"}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted border border-border text-foreground capitalize">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                            TIER_STYLES[r.accessTier] ?? TIER_STYLES[1],
                          )}
                        >
                          {TIER_LABELS[r.accessTier] ?? `Tier ${r.accessTier}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            r.voidTrustScore >= 600
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.voidTrustScore >= 300
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {r.voidTrustScore}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          /1000
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        <div>
                          Agents:{" "}
                          <strong className="text-foreground">
                            {r.maxConcurrentAgents ?? "Plan"}
                          </strong>
                        </div>
                        <div>
                          Sessions:{" "}
                          <strong className="text-foreground">
                            {r.maxActiveSessions ?? "Plan"}
                          </strong>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={r.status}
                          pulse={r.status === "active"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingUser(r)}
                            title="Modify role, trust score, tier, and limits"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors"
                          >
                            <Edit3 className="size-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(r)}
                            disabled={updatingId === r.userId}
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50",
                              r.status === "active"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
                            )}
                          >
                            {r.status === "active" ? "Suspend" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(r)}
                            disabled={updatingId === r.userId}
                            aria-label={`Delete ${r.email ?? r.userId}`}
                            title="Delete cyber profile"
                            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB 2: PLAN QUOTAS */}
      {!loading && activeTab === "quotas" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Void Cyber Plan Limits
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Control how many Cyber agents can run concurrently and how
                  many active Cyber sessions each subscription tier can hold.
                </p>
              </div>
              <button
                type="button"
                disabled={savingConfig}
                onClick={() =>
                  persistCyberConfig(
                    planLimits,
                    skills,
                    autoBootSandbox,
                    "Per-plan Cyber limits updated.",
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-60 transition-colors"
              >
                {savingConfig ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save Plan Limits
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Plan
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Max Concurrent Agents
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Max Active Cyber Sessions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => {
                    const q = planLimits[plan.id] ?? {
                      maxConcurrentAgents: 1,
                      maxActiveCyberSessions: 1,
                    };
                    return (
                      <tr
                        key={plan.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-foreground">
                            {plan.label}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {plan.id}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={q.maxConcurrentAgents}
                            onChange={(e) =>
                              setPlanLimits((prev) => ({
                                ...prev,
                                [plan.id]: {
                                  ...q,
                                  maxConcurrentAgents: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                },
                              }))
                            }
                            aria-label={`Max concurrent agents for ${plan.label}`}
                            className="w-28 bg-background border border-border rounded-lg px-3 py-1.5 text-sm tabular-nums text-foreground"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={q.maxActiveCyberSessions}
                            onChange={(e) =>
                              setPlanLimits((prev) => ({
                                ...prev,
                                [plan.id]: {
                                  ...q,
                                  maxActiveCyberSessions: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                },
                              }))
                            }
                            aria-label={`Max active cyber sessions for ${plan.label}`}
                            className="w-28 bg-background border border-border rounded-lg px-3 py-1.5 text-sm tabular-nums text-foreground"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: E2B BUILT-IN SKILLS */}
      {!loading && activeTab === "skills" && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-cyan-600 dark:text-cyan-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  E2B Sandbox Auto-Hook
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border",
                    e2bConfigured
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
                  )}
                >
                  {e2bConfigured ? "E2B_API_KEY Ready" : "Set E2B_API_KEY"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enabled Git skills are automatically cloned into{" "}
                <code className="font-mono">
                  /home/user/skills/&lt;slug&gt;
                </code>{" "}
                when a Void Cyber E2B sandbox boots up.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoBootSandbox}
                onChange={(e) => {
                  setAutoBootSandbox(e.target.checked);
                  persistCyberConfig(
                    planLimits,
                    skills,
                    e.target.checked,
                    "Updated E2B auto-boot preference.",
                  );
                }}
                className="rounded border-border"
              />
              Auto-hook enabled skills on boot
            </label>
          </div>

          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {skills.map((skill) => (
              <div
                key={skill.slug}
                className="p-4 flex items-start justify-between gap-4 flex-wrap"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GitBranch className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span className="text-sm font-semibold text-foreground">
                      {skill.name}
                    </span>
                    <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {skill.mountPath}
                    </code>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground break-all">
                    {skill.repoUrl}
                  </p>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() => {
                      const next = skills.map((s) =>
                        s.slug === skill.slug
                          ? { ...s, enabled: !s.enabled }
                          : s,
                      );
                      persistCyberConfig(
                        planLimits,
                        next,
                        autoBootSandbox,
                        `${skill.name} ${skill.enabled ? "disabled" : "enabled"}.`,
                      );
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      skill.enabled
                        ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted border-border text-muted-foreground",
                    )}
                  >
                    {skill.enabled && <CheckCircle2 className="size-3.5" />}
                    {skill.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() => {
                      const next = skills.filter((s) => s.slug !== skill.slug);
                      persistCyberConfig(
                        planLimits,
                        next,
                        autoBootSandbox,
                        `Removed skill "${skill.name}".`,
                      );
                    }}
                    aria-label={`Remove ${skill.name}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddSkill}
            className="bg-card border border-border rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Add Built-in E2B Git Skill
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="Skill name (e.g. OWASP API Audit Skill)"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <input
                type="url"
                required
                value={newSkillUrl}
                onChange={(e) => setNewSkillUrl(e.target.value)}
                placeholder="https://github.com/org/security-skill.git"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <input
              type="text"
              value={newSkillDesc}
              onChange={(e) => setNewSkillDesc(e.target.value)}
              placeholder="Short description of what this skill equips the E2B sandbox with"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={savingConfig || !newSkillUrl.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-60 transition-colors"
            >
              {savingConfig ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add &amp; Hook Skill
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: DEFAULT AGENTS — same /agent/new creation & editing system + Extra Mandatory System Prompt */}
      {!loading && activeTab === "agents" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                {
                  id: "auto",
                  label: defaultAutoAgent.name || "Void Cyber (Auto)",
                },
                {
                  id: "scribe",
                  label:
                    findingScribeAgent.name || "Finding Scribe (Bug Logger)",
                },
                { id: "new", label: "+ Create Cyber Agent" },
              ] as const
            ).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setAgentSubTab(sub.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors",
                  agentSubTab === sub.id
                    ? "bg-accent text-foreground border-border"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent",
                )}
              >
                <Bot className="size-3.5" />
                {sub.label}
              </button>
            ))}
          </div>

          {agentSubTab === "auto" && (
            <CyberDefaultAgentEditor
              title="Void Cyber (Auto)"
              subtitle="Default self-improving Void Cyber agent used on /cyber. Follows the /agent/new builder with an extra mandatory system prompt."
              value={defaultAutoAgent}
              factoryDefault={factoryDefaultAgents.defaultAutoAgent}
              saving={savingConfig}
              saveLabel="Save Void Cyber (Auto)"
              onSave={(next) =>
                persistCyberConfig(
                  planLimits,
                  skills,
                  autoBootSandbox,
                  `Saved "${next.name}" configuration.`,
                  next,
                  findingScribeAgent,
                )
              }
            />
          )}

          {agentSubTab === "scribe" && (
            <CyberDefaultAgentEditor
              title="Finding Scribe (Bug Logger)"
              subtitle="Dedicated default agent that structures vulnerabilities and saves them directly to Recent Findings on /cyber/dashboard."
              value={findingScribeAgent}
              factoryDefault={factoryDefaultAgents.findingScribeAgent}
              saving={savingConfig}
              saveLabel="Save Finding Scribe"
              onSave={(next) =>
                persistCyberConfig(
                  planLimits,
                  skills,
                  autoBootSandbox,
                  `Saved "${next.name}" configuration.`,
                  defaultAutoAgent,
                  next,
                )
              }
            />
          )}

          {agentSubTab === "new" && (
            <CyberDefaultAgentEditor
              title="Create Shared Cyber Agent"
              subtitle="Create a new Void Cyber agent using the /agent/new builder + mandatory system prompt. Appears immediately in /agents and /cyber."
              value={newCyberAgentDraft}
              saving={savingConfig}
              saveLabel="Create Cyber Agent"
              onSave={handleCreateCyberAgentFromAdmin}
            />
          )}
        </div>
      )}

      {showGrant && (
        <GrantAccessModal
          onClose={() => setShowGrant(false)}
          onGranted={(r) => {
            setResearchers((prev) => {
              const exists = prev.some((x) => x.userId === r.userId);
              return exists
                ? prev.map((x) => (x.userId === r.userId ? r : x))
                : [r, ...prev];
            });
            setShowGrant(false);
          }}
        />
      )}

      {editingUser && (
        <EditResearcherModal
          researcher={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setResearchers((prev) =>
              prev.map((x) => (x.userId === updated.userId ? updated : x)),
            );
            setEditingUser(null);
            setSavedNotice("Researcher profile updated.");
            setTimeout(() => setSavedNotice(null), 3000);
          }}
        />
      )}
    </div>
  );
}
