"use client";

import { useAgents } from "@/hooks/queries/use-agents";
import { INTERNAL_HOOK_EVENT_TYPES } from "@/lib/hooks/event-types";
import { fetcher } from "lib/utils";
import { Loader, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Textarea } from "ui/textarea";

/**
 * Void Hooks (master prompt §3.5): event-driven agent automation. Each hook
 * is an inbound endpoint bound to an agent — a webhook/email/Slack event on
 * the hook's URL runs that agent, with cooldown + daily-cap loop prevention
 * and a full run audit. Execution is dispatched by the webhook outbox tick;
 * this UI manages hooks and shows the runs.
 */

interface HookView {
  id: string;
  kind: string;
  agentId: string;
  token: string;
  enabled: boolean;
  hookConfig: {
    promptTemplate?: string;
    script?: {
      language: "javascript" | "typescript" | "python";
      source: string;
    };
    cooldownSeconds?: number;
    maxRunsPerDay?: number;
    chainOnSuccess?: string[];
    eventTypes?: string[];
  };
  createdAt: string;
}

interface HookRunView {
  id: string;
  status: string;
  agentId: string;
  threadId: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-primary/10 text-primary",
  failed: "bg-destructive/10 text-destructive",
  running: "bg-blue-500/10 text-blue-600",
  queued: "bg-muted text-muted-foreground",
  skipped: "bg-amber-500/10 text-amber-600",
};

export function VoidHooksDashboard() {
  // Background hooks are bound to owner agents; shared-agent access may be
  // revoked and cannot be revalidated against an active org at run time.
  const { agents } = useAgents({ filters: ["mine"] });
  const { data, error, mutate } = useSWR<{
    hooks: HookView[];
    runs: HookRunView[];
  }>("/api/hooks", fetcher);

  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<
    "webhook" | "email" | "slack" | "github" | "event"
  >("webhook");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState<
    "javascript" | "typescript" | "python"
  >("javascript");
  const [scriptSource, setScriptSource] = useState("");
  const [scriptEnabled, setScriptEnabled] = useState(false);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editScriptLanguage, setEditScriptLanguage] = useState<
    "javascript" | "typescript" | "python"
  >("javascript");
  const [editScriptSource, setEditScriptSource] = useState("");
  const [created, setCreated] = useState<{
    inboundUrl?: string;
    secret?: string;
    kind: string;
    eventTypes?: string[];
  } | null>(null);

  // Default the agent picker to the first available agent once loaded.
  useEffect(() => {
    if (!agentId && agents?.length) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const createHook = useCallback(async () => {
    if (!agentId) {
      toast.error("Pick an agent for the hook to drive.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          agentId,
          promptTemplate: promptTemplate.trim() || undefined,
          eventTypes: kind === "event" ? eventTypes : undefined,
          script: scriptEnabled
            ? { language: scriptLanguage, source: scriptSource }
            : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create the hook.");
      }
      setCreated({
        inboundUrl: payload.inboundUrl
          ? `${window.location.origin}${payload.inboundUrl}`
          : undefined,
        secret: payload.secret,
        kind,
        eventTypes: payload.eventTypes,
      });
      setPromptTemplate("");
      setScriptSource("");
      setScriptEnabled(false);
      toast.success("Hook created.");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setCreating(false);
    }
  }, [
    agentId,
    kind,
    eventTypes,
    mutate,
    promptTemplate,
    scriptEnabled,
    scriptLanguage,
    scriptSource,
  ]);

  const toggleEnabled = useCallback(
    async (hook: HookView) => {
      const response = await fetch(`/api/hooks/${hook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !hook.enabled }),
      });
      if (!response.ok) {
        toast.error("Could not update the hook.");
        return;
      }
      await mutate();
    },
    [mutate],
  );

  const deleteHook = useCallback(
    async (hook: HookView) => {
      const response = await fetch(`/api/hooks/${hook.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error("Could not delete the hook.");
        return;
      }
      toast.success("Hook deleted.");
      await mutate();
    },
    [mutate],
  );

  const updateHookChain = useCallback(
    async (hook: HookView, chainOnSuccess: string[]) => {
      if (chainOnSuccess.length > 3) {
        toast.error("A hook can chain to at most three hooks.");
        await mutate();
        return;
      }
      const response = await fetch(`/api/hooks/${hook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainOnSuccess }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        toast.error(payload?.error ?? "Could not update the hook chain.");
        return;
      }
      await mutate();
    },
    [mutate],
  );

  const saveHookScript = useCallback(
    async (hook: HookView) => {
      const response = await fetch(`/api/hooks/${hook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: editScriptSource.trim()
            ? { language: editScriptLanguage, source: editScriptSource }
            : null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? "Could not update the hook script.");
        return;
      }
      setEditingScriptId(null);
      toast.success(
        editScriptSource.trim() ? "Hook script saved." : "Hook script removed.",
      );
      await mutate();
    },
    [editScriptLanguage, editScriptSource, mutate],
  );

  const hooks = data?.hooks ?? [];
  const runs = data?.runs ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            Void Hooks
            {data ? (
              <RefreshCw
                className="size-3.5 cursor-pointer text-muted-foreground"
                onClick={() => mutate()}
              />
            ) : (
              <Loader className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <CardDescription>
            Inbound and internal events run an agent, optionally after a
            JavaScript, TypeScript, or Python script step in an isolated
            sandbox.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create */}
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as typeof kind)}
            >
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="event">Internal event</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder="Agent…" />
              </SelectTrigger>
              <SelectContent>
                {(agents ?? []).map((agent: { id: string; name: string }) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={createHook}
              disabled={creating || (scriptEnabled && !scriptSource.trim())}
            >
              {creating ? (
                <Loader className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 size-3.5" />
              )}
              Create hook
            </Button>
          </div>
          {kind === "event" ? (
            <div className="space-y-1">
              <p className="text-xs font-medium">Trigger events</p>
              <select
                aria-label="Internal events"
                className="min-h-24 w-full max-w-xl rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                multiple
                value={eventTypes}
                onChange={(event) =>
                  setEventTypes(
                    [...event.currentTarget.selectedOptions].map(
                      (option) => option.value,
                    ),
                  )
                }
              >
                {INTERNAL_HOOK_EVENT_TYPES.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Only events produced by actions in your own account trigger this
                hook. Select one or more.
              </p>
            </div>
          ) : null}
          <Textarea
            value={promptTemplate}
            onChange={(event) => setPromptTemplate(event.target.value)}
            rows={2}
            placeholder="Prompt template (optional) — {{kind}}, {{from}}, {{subject}}, {{text}}, {{json}}"
            className="font-mono text-xs"
          />
          <div className="space-y-2 rounded-lg border p-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={scriptEnabled}
                onChange={(event) => setScriptEnabled(event.target.checked)}
              />
              Run a user script in an isolated E2B sandbox before the agent
            </label>
            {scriptEnabled ? (
              <>
                <Select
                  value={scriptLanguage}
                  onValueChange={(value) =>
                    setScriptLanguage(value as typeof scriptLanguage)
                  }
                >
                  <SelectTrigger className="h-8 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={scriptSource}
                  onChange={(event) => setScriptSource(event.target.value)}
                  rows={6}
                  maxLength={16_000}
                  placeholder={
                    scriptLanguage === "python"
                      ? "# Event data is available as payload\nprint(payload)"
                      : "// Event data is available as payload\nconsole.log(payload);"
                  }
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  The script receives the event as <code>payload</code>.
                  Print/log output is passed to the agent. Network access is
                  disabled; each run is limited to 30 seconds and 16,000 source
                  characters. E2B_API_KEY is required.
                </p>
              </>
            ) : null}
          </div>
          {kind === "github" ? (
            <p className="text-xs text-muted-foreground">
              Add this URL to your repository webhook in GitHub. Set content
              type to application/json, paste the shown secret, and subscribe to
              push, pull request, and issue events.
            </p>
          ) : null}
        </div>

        {/* One-time secret */}
        {created ? (
          <div className="space-y-2 rounded-xl border border-primary/40 p-3">
            <p className="text-sm font-medium">
              {created.kind === "event"
                ? "Internal event hook created."
                : "Hook created — inbound URL and signing secret (shown once):"}
            </p>
            {created.inboundUrl ? (
              <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                {created.inboundUrl}
              </code>
            ) : null}
            {created.secret ? (
              <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                {created.secret}
              </code>
            ) : null}
            {created.eventTypes?.length ? (
              <p className="text-xs text-muted-foreground">
                Listening for: {created.eventTypes.join(", ")}
              </p>
            ) : null}
            {created.kind === "github" ? (
              <p className="text-xs text-muted-foreground">
                Paste this secret into GitHub’s webhook Secret field. GitHub
                signs deliveries with it; keep it private.
              </p>
            ) : null}
            {created.inboundUrl && created.secret ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`${created.inboundUrl}\n${created.secret}`)
                    .then(() => toast.success("Copied."));
                }}
              >
                Copy both
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Hook list */}
        {hooks.length === 0 && !data ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader className="size-4 animate-spin" />
            Loading hooks…
          </div>
        ) : hooks.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            No hooks yet. Create one above — the agent then runs on every event
            that hits its inbound URL.
          </p>
        ) : (
          <div className="space-y-2">
            {hooks.map((hook) => {
              const agentName =
                (agents ?? []).find((agent) => agent.id === hook.agentId)
                  ?.name ?? hook.agentId;
              return (
                <div
                  key={hook.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium capitalize">
                      {hook.kind} hook → {agentName}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${
                          hook.enabled
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {hook.enabled ? "enabled" : "paused"}
                      </span>
                    </p>
                    {hook.kind === "event" ? (
                      <p className="text-[11px] text-muted-foreground">
                        Events: {(hook.hookConfig.eventTypes ?? []).join(", ")}
                      </p>
                    ) : (
                      <code className="block max-w-full truncate rounded bg-muted px-2 py-1 text-[11px]">
                        /api/inbound/{hook.token}
                      </code>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      cooldown {hook.hookConfig.cooldownSeconds ?? 60}s · cap{" "}
                      {hook.hookConfig.maxRunsPerDay ?? 20}/day
                    </p>
                    <div className="space-y-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingScriptId(
                            editingScriptId === hook.id ? null : hook.id,
                          );
                          setEditScriptLanguage(
                            hook.hookConfig.script?.language ?? "javascript",
                          );
                          setEditScriptSource(
                            hook.hookConfig.script?.source ?? "",
                          );
                        }}
                      >
                        {hook.hookConfig.script ? "Edit script" : "Add script"}
                      </Button>
                      {hook.hookConfig.script ? (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {hook.hookConfig.script.language} script enabled
                        </span>
                      ) : null}
                      {editingScriptId === hook.id ? (
                        <div className="max-w-2xl space-y-2">
                          <Select
                            value={editScriptLanguage}
                            onValueChange={(value) =>
                              setEditScriptLanguage(
                                value as typeof editScriptLanguage,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="javascript">
                                JavaScript
                              </SelectItem>
                              <SelectItem value="typescript">
                                TypeScript
                              </SelectItem>
                              <SelectItem value="python">Python</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={editScriptSource}
                            onChange={(event) =>
                              setEditScriptSource(event.target.value)
                            }
                            rows={5}
                            maxLength={16_000}
                            placeholder="Script receives event data as payload. Print/log output is passed to the agent."
                            className="font-mono text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveHookScript(hook)}
                              disabled={editScriptSource.length > 16_000}
                            >
                              Save script
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingScriptId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <label className="flex flex-col gap-1 pt-1 text-[11px] text-muted-foreground">
                      Run up to 3 enabled hooks after success (chains stop at 3
                      hops):
                      <select
                        aria-label={`Hooks to run after ${agentName} succeeds`}
                        className="min-h-16 max-w-sm rounded-md border bg-background px-2 py-1 text-foreground"
                        disabled={!hook.enabled}
                        multiple
                        value={hook.hookConfig.chainOnSuccess ?? []}
                        onChange={(event) =>
                          updateHookChain(
                            hook,
                            [...event.currentTarget.selectedOptions].map(
                              (option) => option.value,
                            ),
                          )
                        }
                      >
                        {hooks
                          .filter(
                            (target) => target.id !== hook.id && target.enabled,
                          )
                          .map((target) => (
                            <option key={target.id} value={target.id}>
                              {agents?.find(
                                (agent) => agent.id === target.agentId,
                              )?.name ?? target.kind}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleEnabled(hook)}
                    >
                      {hook.enabled ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteHook(hook)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Run history */}
        {runs.length > 0 ? (
          <div className="space-y-1.5 rounded-xl border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent hook runs
            </p>
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-muted/40"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    STATUS_STYLES[run.status] ?? "bg-muted"
                  }`}
                >
                  {run.status}
                </span>
                {run.threadId ? (
                  <a
                    href={`/chat/${run.threadId}`}
                    className="text-primary hover:underline"
                  >
                    open thread
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span className="text-muted-foreground">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
                {run.error ? (
                  <span className="max-w-[40ch] truncate text-destructive">
                    {run.error}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
