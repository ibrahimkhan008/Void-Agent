"use client";

import { useAgents } from "@/hooks/queries/use-agents";
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
    cooldownSeconds?: number;
    maxRunsPerDay?: number;
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
  const { agents } = useAgents({ filters: ["all"] });
  const { data, error, mutate } = useSWR<{
    hooks: HookView[];
    runs: HookRunView[];
  }>("/api/hooks", fetcher);

  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"webhook" | "email" | "slack">("webhook");
  const [agentId, setAgentId] = useState<string>("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [created, setCreated] = useState<{
    inboundUrl: string;
    secret: string;
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
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create the hook.");
      }
      setCreated({ inboundUrl: payload.inboundUrl, secret: payload.secret });
      setPromptTemplate("");
      toast.success("Hook created.");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setCreating(false);
    }
  }, [agentId, kind, mutate, promptTemplate]);

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
            Inbound events run an agent: point a webhook (or email/Slack source)
            at the hook URL and every event executes it — with cooldown and
            daily-cap loop prevention.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create */}
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(value as "webhook" | "email" | "slack")
              }
            >
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
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
            <Button size="sm" onClick={createHook} disabled={creating}>
              {creating ? (
                <Loader className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 size-3.5" />
              )}
              Create hook
            </Button>
          </div>
          <Textarea
            value={promptTemplate}
            onChange={(event) => setPromptTemplate(event.target.value)}
            rows={2}
            placeholder="Prompt template (optional) — {{kind}}, {{from}}, {{subject}}, {{text}}, {{json}}"
            className="font-mono text-xs"
          />
        </div>

        {/* One-time secret */}
        {created ? (
          <div className="space-y-2 rounded-xl border border-primary/40 p-3">
            <p className="text-sm font-medium">
              Hook created — inbound URL and signing secret (shown once):
            </p>
            <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
              {created.inboundUrl}
            </code>
            <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
              {created.secret}
            </code>
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
                    <code className="block max-w-full truncate rounded bg-muted px-2 py-1 text-[11px]">
                      /api/inbound/{hook.token}
                    </code>
                    <p className="text-[11px] text-muted-foreground">
                      cooldown {hook.hookConfig.cooldownSeconds ?? 60}s · cap{" "}
                      {hook.hookConfig.maxRunsPerDay ?? 20}/day
                    </p>
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
