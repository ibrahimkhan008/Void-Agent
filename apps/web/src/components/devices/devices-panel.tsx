"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  CalendarClock,
  Coins,
  Cpu,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Void Devices (master prompt §3.14): the user's sandbox machines and their
 * plan's usage quotas. Shows the ACTIVE sandbox with runtime/quota left, the
 * idle (paused) machines, and the per-plan quota table with weekly/daily
 * resets.
 */

interface DeviceSandbox {
  sandboxId: string;
  name: string | null;
  templateId: string | null;
  state: "running" | "paused";
  startedAt: string | null;
  cpuCount: number | null;
  memoryMb: number | null;
}

interface DeviceQuota {
  metric: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
  resetAt: string;
}

interface DevicesPayload {
  plan: string;
  tier: string;
  quotas: DeviceQuota[];
  active: DeviceSandbox[];
  idle: DeviceSandbox[];
  e2bConfigured: boolean;
}

const QUOTA_ICONS: Record<string, typeof Rocket> = {
  cloud_agent_launches: Rocket,
  sandbox_cpu_hours: Cpu,
  agent_tokens: Coins,
  swarm_launches: Users,
  scheduled_runs: CalendarClock,
};

function formatHours(value: number) {
  return `${value.toFixed(value < 10 ? 2 : 1)} h`;
}

function formatCount(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function formatUsed(metric: string, used: number) {
  if (metric === "sandbox_cpu_hours") return formatHours(used);
  if (metric === "agent_tokens") return formatCount(used);
  return String(Math.round(used));
}

function formatLimit(metric: string, limit: number) {
  if (metric === "agent_tokens") return formatCount(limit);
  return String(limit);
}

function startedLabel(startedAt: string | null) {
  if (!startedAt) return "—";
  const diff = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `started ${Math.max(minutes, 1)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `started ${hours} h ${minutes % 60} min ago`;
  return `started ${Math.floor(hours / 24)} d ago`;
}

export function DevicesPanel() {
  const [payload, setPayload] = useState<DevicesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/devices");
    if (response.ok) {
      setPayload(await response.json());
      setError(null);
    } else {
      setError("Could not load your devices");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sandboxAction(sandboxId: string, _action: "pause") {
    setWorking(sandboxId);
    try {
      await fetch(`/api/sandbox/${sandboxId}/pause`, { method: "POST" });
      await load();
    } finally {
      setWorking(null);
    }
  }

  const quotas = useMemo(() => payload?.quotas ?? [], [payload]);
  const weeklyReset = quotas[0]?.resetAt
    ? new Date(quotas[0].resetAt).toUTCString().slice(0, 22) + " UTC"
    : null;
  const dailyReset = quotas.find((quota) => quota.metric === "swarm_launches")
    ?.resetAt
    ? new Date(
        quotas.find((quota) => quota.metric === "swarm_launches")!.resetAt,
      )
        .toUTCString()
        .slice(0, 22) + " UTC"
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Sandbox</h2>
        <p className="text-sm text-muted-foreground">
          Your sandbox machines and plan usage. Usage resets weekly on Monday
          (UTC); swarm launches reset daily.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your sandboxes…</p>
      ) : null}

      {!loading && payload && !payload.e2bConfigured ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Sandboxes are not configured on this deployment (E2B key missing) —
          ask the administrator to enable code execution.
        </p>
      ) : null}

      {payload ? (
        <>
          {/* Quota table */}
          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan usage — {payload.plan}
              </Label>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => void load()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                </Button>
                <a
                  href="/pricing"
                  className="text-xs underline underline-offset-2"
                >
                  Upgrade
                </a>
              </div>
            </div>
            <div className="mt-3 space-y-4">
              {quotas.map((quota) => {
                const Icon = QUOTA_ICONS[quota.metric] ?? Rocket;
                const pct = Math.min(
                  100,
                  Math.round((quota.used / Math.max(quota.limit, 1)) * 100),
                );
                const reset =
                  quota.metric === "swarm_launches" ? dailyReset : weeklyReset;
                return (
                  <div key={quota.metric} className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{quota.label}</p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {formatUsed(quota.metric, quota.used)} /{" "}
                          {formatLimit(quota.metric, quota.limit)} {quota.unit}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="w-24 text-right text-xs text-muted-foreground">
                          resets{" "}
                          {quota.metric === "swarm_launches"
                            ? "daily"
                            : "Mon UTC"}
                          {reset ? ` · ${reset}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Active sandbox */}
          <section className="rounded-lg border p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Active sandbox
            </Label>
            {payload.active.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No sandbox is running right now. Launch an agent or build an app
                and it will appear here.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {payload.active.map((sandbox) => {
                  const quota = quotas.find(
                    (item) => item.metric === "sandbox_cpu_hours",
                  );
                  return (
                    <div
                      key={sandbox.sandboxId}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-sm font-medium">
                            {sandbox.name ?? sandbox.templateId ?? "Sandbox"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {startedLabel(sandbox.startedAt)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>
                          <Monitor className="mr-1 inline h-3 w-3" />
                          {sandbox.cpuCount ?? "?"} vCPU
                        </span>
                        <span>
                          {sandbox.memoryMb
                            ? `${sandbox.memoryMb} MB RAM`
                            : "—"}
                        </span>
                        <span className="font-mono">
                          {sandbox.sandboxId.slice(0, 8)}…
                        </span>
                      </div>
                      {quota ? (
                        <div className="mt-2 text-xs">
                          CPU hours this week:{" "}
                          <span className="font-medium">
                            {formatHours(quota.used)} / {quota.limit} h
                          </span>{" "}
                          — {Math.max(quota.limit - quota.used, 0).toFixed(2)} h
                          left until reset
                        </div>
                      ) : null}
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working === sandbox.sandboxId}
                          onClick={() =>
                            void sandboxAction(sandbox.sandboxId, "pause")
                          }
                        >
                          <Pause className="mr-1 h-3 w-3" />
                          {working === sandbox.sandboxId ? "Pausing…" : "Pause"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Idle machines */}
          <section className="rounded-lg border p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Idle machines ({payload.idle.length})
            </Label>
            {payload.idle.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No paused sandboxes. Machines you pause are kept here with their
                state intact.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {payload.idle.map((sandbox) => (
                  <div
                    key={sandbox.sandboxId}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {sandbox.name ?? sandbox.templateId ?? "Sandbox"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Paused · {sandbox.cpuCount ?? "?"} vCPU ·{" "}
                        <span className="font-mono">
                          {sandbox.sandboxId.slice(0, 8)}…
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      title="Resume from the tool that created this sandbox"
                    >
                      <Play className="mr-1 h-3 w-3" /> Paused
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
