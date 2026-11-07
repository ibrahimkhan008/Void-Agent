"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Switch } from "ui/switch";

const TASKS = [
  "general_chat",
  "coding",
  "web_development",
  "web_search",
  "document_extraction",
  "tool_calling",
  "writing",
  "reasoning",
  "vision",
] as const;

type Task = (typeof TASKS)[number];
type Team = { id: string; name: string; role: string };
type ModelOption = {
  provider: string;
  model: string;
  toolCalling: boolean;
  vision: boolean;
};
type Profile = {
  provider: string;
  model: string;
  priority: number;
  taskScores: Partial<Record<Task, number>>;
};
type RoutingResponse = {
  policy: { enabled: boolean; profiles: Profile[] };
  canManage: boolean;
  models: ModelOption[];
};
type AuditItem = {
  id: string;
  taskKey: Task;
  selectedProvider: string;
  selectedModel: string;
  reasonCode: string;
  createdAt: string;
};

const modelKey = (model: Pick<ModelOption, "provider" | "model">) =>
  `${model.provider.toLowerCase()}\u0000${model.model}`;

const taskLabel = (task: Task) =>
  task.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function TeamModelRoutingSettings() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditError, setAuditError] = useState("");

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    setError("");
    try {
      const response = await fetch("/api/projects/teams", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load teams.");
      const nextTeams = (body.teams ?? []) as Team[];
      setTeams(nextTeams);
      setTeamId((current) => current || nextTeams[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load teams.");
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const loadAudits = useCallback(async (cursor?: string, append = false) => {
    if (!teamId) return;
    if (append) setAuditLoadingMore(true);
    else setAuditLoading(true);
    setAuditError("");
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/model-routing/audit?${query}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load routing audit.");
      setAudits((current) => append ? [...current, ...(body.items ?? [])] : body.items ?? []);
      setAuditCursor(body.nextCursor ?? null);
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "Could not load routing audit.");
    } finally {
      setAuditLoading(false);
      setAuditLoadingMore(false);
    }
  }, [teamId]);

  const loadPolicy = useCallback(async () => {
    if (!teamId) {
      setRouting(null);
      return;
    }
    setRouting(null);
    setAudits([]);
    setAuditCursor(null);
    setAuditError("");
    setLoadingPolicy(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/model-routing`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load routing settings.");
      const data = body as RoutingResponse;
      setRouting(data);
      setEnabled(data.policy.enabled);
      setProfiles(data.policy.profiles);
    } catch (cause) {
      setRouting(null);
      setError(cause instanceof Error ? cause.message : "Could not load routing settings.");
    } finally {
      setLoadingPolicy(false);
    }
  }, [teamId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  useEffect(() => {
    if (!routing?.canManage) {
      setAudits([]);
      setAuditCursor(null);
      return;
    }
    void loadAudits();
  }, [loadAudits, routing?.canManage]);

  const availableModels = useMemo(() => routing?.models ?? [], [routing]);
  const configuredKeys = new Set(profiles.map(modelKey));
  const addableModels = availableModels.filter((model) => !configuredKeys.has(modelKey(model)));

  const addModel = () => {
    const model = addableModels[0];
    if (!model) return;
    setProfiles((current) => [
      ...current,
      { provider: model.provider, model: model.model, priority: current.length * 10, taskScores: {} },
    ]);
    setSaved(false);
  };

  const updateProfile = (index: number, update: Partial<Profile>) => {
    setProfiles((current) => current.map((profile, i) => i === index ? { ...profile, ...update } : profile));
    setSaved(false);
  };

  const updateTaskScore = (index: number, task: Task, rawValue: string) => {
    const value = rawValue === "" ? undefined : Number(rawValue);
    setProfiles((current) => current.map((profile, i) => {
      if (i !== index) return profile;
      const taskScores = { ...profile.taskScores };
      if (value === undefined || !Number.isInteger(value)) delete taskScores[task];
      else taskScores[task] = Math.max(-100, Math.min(100, value));
      return { ...profile, taskScores };
    }));
    setSaved(false);
  };

  const save = async () => {
    if (!teamId || !routing?.canManage || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/model-routing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, profiles }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save routing settings.");
      setSaved(true);
      setRouting((current) => current ? { ...current, policy: body.policy } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save routing settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-5 md:p-8" data-testid="team-model-routing-settings">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Team model routing</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose which administrator-enabled models the team can use for automatic routing. The first eligible model is pinned for each thread; task scores rank eligible models, and capability requirements still apply.
        </p>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void (teamId ? loadPolicy() : loadTeams())}>Retry</Button>
        </div>
      )}

      {loadingTeams ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading teams…</p>
      ) : teams.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">You do not belong to a team yet.</p>
      ) : (
        <>
          <label className="block max-w-md space-y-2 text-sm font-medium">
            <span>Team</span>
            <select
              aria-label="Team"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={loadingTeams || saving}
            >
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          {loadingPolicy || (!routing && !error) ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading routing policy…</p>
          ) : !routing ? (
            <p role="status" className="rounded-md border p-4 text-sm text-muted-foreground">Routing settings could not be loaded. Use Retry to try again.</p>
          ) : (
            <div className="space-y-5 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">Automatic model selection</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Only models in this allowlist are considered.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
                  <Switch checked={enabled} disabled={!routing.canManage || saving} onCheckedChange={(checked) => { setEnabled(checked); setSaved(false); }} aria-label="Enable team model routing" />
                </div>
              </div>

              {!routing.canManage && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Only team owners and admins can change routing policy.</p>}

              <div className="space-y-3">
                {profiles.map((profile, index) => {
                  const key = modelKey(profile);
                  const isAvailable = availableModels.some((model) => modelKey(model) === key);
                  return (
                    <article key={`${key}-${index}`} className="space-y-3 rounded-lg border p-4" data-testid="routing-profile">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
                        <label className="space-y-1 text-sm font-medium">
                          <span>Allowed model</span>
                          <select
                            aria-label={`Allowed model ${index + 1}`}
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={key}
                            disabled={!routing.canManage || saving}
                            onChange={(event) => {
                              const selected = availableModels.find((model) => modelKey(model) === event.target.value);
                              if (selected) updateProfile(index, { provider: selected.provider, model: selected.model });
                            }}
                          >
                            {!isAvailable && <option value={key}>Unavailable: {profile.provider}/{profile.model}</option>}
                            {availableModels.map((model) => <option key={modelKey(model)} value={modelKey(model)}>{model.provider} / {model.model}{model.vision ? " · vision" : ""}{model.toolCalling ? " · tools" : ""}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm font-medium">
                          <span>Priority</span>
                          <Input type="number" min={0} max={1000} step={1} aria-label={`Priority ${index + 1}`} value={profile.priority} disabled={!routing.canManage || saving} onChange={(event) => updateProfile(index, { priority: Number(event.target.value) || 0 })} />
                        </label>
                        {routing.canManage && <Button type="button" variant="outline" size="icon" aria-label={`Remove ${profile.provider} ${profile.model}`} disabled={saving} onClick={() => { setProfiles((current) => current.filter((_, i) => i !== index)); setSaved(false); }}><Trash2 className="size-4" /></Button>}
                      </div>
                      <details className="rounded-md bg-muted/30 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-medium">Task scores</summary>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {TASKS.map((task) => (
                            <label key={task} className="flex items-center justify-between gap-3 text-sm">
                              <span>{taskLabel(task)}</span>
                              <Input type="number" min={-100} max={100} step={1} aria-label={`${taskLabel(task)} score for ${profile.provider} ${profile.model}`} className="w-24" value={profile.taskScores[task] ?? ""} disabled={!routing.canManage || saving} onChange={(event) => updateTaskScore(index, task, event.target.value)} />
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Higher score ranks first for that task. Priority breaks ties; lower priority values win.</p>
                      </details>
                    </article>
                  );
                })}
                {profiles.length === 0 && <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">Add at least one allowed model before enabling automatic routing.</p>}
              </div>

              {routing.canManage && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" disabled={saving || addableModels.length === 0} onClick={addModel}><Plus className="size-4" />Add model</Button>
                  <Button type="button" disabled={saving || loadingPolicy || (enabled && profiles.length === 0)} onClick={() => void save()}>
                    {saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : "Save routing policy"}
                  </Button>
                  {saved && <span role="status" className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Saved</span>}
                </div>
              )}

              {routing.canManage && (
                <section className="space-y-3 border-t pt-5" aria-labelledby="routing-audit-heading">
                  <div>
                    <h3 id="routing-audit-heading" className="text-base font-semibold">Recent routing decisions</h3>
                    <p className="text-sm text-muted-foreground">Recent task and model choices. Prompts, user identifiers, and provider credentials are not included.</p>
                  </div>
                  {auditError && (
                    <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{auditError}</span>
                      <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={auditLoading} onClick={() => void loadAudits()}>
                        Retry audit
                      </Button>
                    </div>
                  )}
                  {auditLoading ? (
                    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading routing history…</p>
                  ) : audits.length === 0 && !auditError ? (
                    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No routing decisions have been recorded yet.</p>
                  ) : (
                    <>
                      <ol className="divide-y rounded-md border" aria-label="Recent routing decisions">
                        {audits.map((audit) => (
                          <li key={audit.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                            <span><strong>{taskLabel(audit.taskKey)}</strong><span className="text-muted-foreground"> → </span>{audit.selectedProvider} / {audit.selectedModel}</span>
                            <span className="text-xs text-muted-foreground" title={audit.reasonCode}>{new Date(audit.createdAt).toLocaleString()}</span>
                          </li>
                        ))}
                      </ol>
                      {auditCursor && (
                        <Button type="button" variant="outline" size="sm" disabled={auditLoadingMore} onClick={() => void loadAudits(auditCursor, true)}>
                          {auditLoadingMore ? <><Loader2 className="size-4 animate-spin" />Loading…</> : "Load more decisions"}
                        </Button>
                      )}
                    </>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
