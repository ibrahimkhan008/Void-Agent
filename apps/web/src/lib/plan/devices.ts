import "server-only";

import { utcDayStart } from "@/lib/ai/orchestrator/quota";
import {
  PLAN_USAGE_METRICS,
  planUsageRepository,
} from "@/lib/db/pg/repositories/plan-usage-repository.pg";
import {
  devicePlanLimits,
  nextDailyReset,
  nextWeeklyReset,
  weekKey,
} from "@/lib/plan/limits";
import { Sandbox } from "@e2b/code-interpreter";
import { normalizeSubscriptionTier } from "app-types/subscription";
import { userRepository } from "lib/db/repository";
import logger from "logger";

/**
 * Void Devices payload (master prompt §3.14 — the user-facing layer over the
 * platform's sandbox machines): what the user's plan allots, what they have
 * used this week, and the live state of their sandbox machines (active vs
 * paused). Pure assembly — every counter is real.
 */

export interface DeviceSandboxView {
  sandboxId: string;
  name: string | null;
  templateId: string | null;
  state: "running" | "paused";
  startedAt: string | null;
  cpuCount: number | null;
  memoryMb: number | null;
}

export interface DeviceQuotaView {
  metric: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
  resetAt: string;
}

const MAX_LIST_PAGES = 4;

async function listUserSandboxes(userId: string): Promise<DeviceSandboxView[]> {
  if (!process.env.E2B_API_KEY) return [];
  const out: DeviceSandboxView[] = [];
  try {
    for (const state of ["running", "paused"] as const) {
      const paginator = Sandbox.list({
        query: { state: [state], metadata: { billingUserId: userId } },
        limit: 100,
        apiKey: process.env.E2B_API_KEY,
      });
      for (let page = 0; page < MAX_LIST_PAGES && paginator.hasNext; page++) {
        const batch = await paginator.nextItems();
        for (const info of batch) {
          out.push({
            sandboxId: info.sandboxId,
            name: info.name ?? null,
            templateId: info.templateId ?? null,
            state,
            startedAt: info.startedAt
              ? new Date(info.startedAt).toISOString()
              : null,
            cpuCount: info.cpuCount ?? null,
            memoryMb: info.memoryMb ?? null,
          });
        }
      }
    }
  } catch (error) {
    logger.error(
      "[devices] sandbox listing failed",
      error instanceof Error ? error.message : error,
    );
  }
  return out;
}

/** Sandbox CPU hours used this week: running time clamped to the week window. */
function computeWeeklyCpuHours(
  sandboxes: DeviceSandboxView[],
  weekStart: Date,
  now: Date,
): number {
  let cpuHours = 0;
  for (const sandbox of sandboxes) {
    if (sandbox.state !== "running" || !sandbox.startedAt) continue;
    const started = new Date(sandbox.startedAt);
    const effectiveStart = started > weekStart ? started : weekStart;
    const hours =
      ((now.getTime() - effectiveStart.getTime()) / 3_600_000) *
      (sandbox.cpuCount ?? 1);
    if (hours > 0) cpuHours += hours;
  }
  return Math.round(cpuHours * 100) / 100;
}

export interface DevicesPayload {
  plan: string;
  tier: string;
  quotas: DeviceQuotaView[];
  active: DeviceSandboxView[];
  idle: DeviceSandboxView[];
  e2bConfigured: boolean;
}

export async function getDevicesPayload(
  userId: string,
  tierRaw: string | null | undefined,
): Promise<DevicesPayload> {
  const tier = normalizeSubscriptionTier(tierRaw);
  const limits = devicePlanLimits(tier);
  const now = new Date();
  const week = weekKey(now);
  const day = utcDayStart(now).toISOString().slice(0, 10);

  const [usage, prefs, sandboxes] = await Promise.all([
    planUsageRepository.getUsage(userId, PLAN_USAGE_METRICS, week),
    userRepository.getPreferences(userId).catch(() => null),
    listUserSandboxes(userId),
  ]);

  const swarmRaw = (
    prefs as
      | {
          orchestratorDailyUsage?: { day?: string; used?: number };
        }
      | undefined
  )?.orchestratorDailyUsage;
  const swarmUsed = swarmRaw?.day === day ? Number(swarmRaw.used ?? 0) : 0;

  const cpuHours = computeWeeklyCpuHours(
    sandboxes,
    new Date(week + "T00:00:00Z"),
    now,
  );

  const quotas: DeviceQuotaView[] = [
    {
      metric: "cloud_agent_launches",
      label: "Cloud Agent launches / week",
      used: usage.agent_launches ?? 0,
      limit: limits.agentLaunchesPerWeek,
      unit: "launches",
      resetAt: nextWeeklyReset(now).toISOString(),
    },
    {
      metric: "sandbox_cpu_hours",
      label: "Sandbox CPU hours / week",
      used: cpuHours,
      limit: limits.sandboxCpuHoursPerWeek,
      unit: "CPU hours",
      resetAt: nextWeeklyReset(now).toISOString(),
    },
    {
      metric: "agent_tokens",
      label: "Agent tokens / week",
      used: usage.agent_tokens ?? 0,
      limit: limits.agentTokensPerWeek,
      unit: "tokens",
      resetAt: nextWeeklyReset(now).toISOString(),
    },
    {
      metric: "swarm_launches",
      label: "Swarm launches / day",
      used: swarmUsed,
      limit: limits.swarmLaunchesPerDay,
      unit: "launches",
      resetAt: nextDailyReset(now).toISOString(),
    },
    {
      metric: "scheduled_runs",
      label: "Scheduled runs / week",
      used: usage.scheduled_runs ?? 0,
      limit: limits.scheduledRunsPerWeek,
      unit: "runs",
      resetAt: nextWeeklyReset(now).toISOString(),
    },
  ];

  return {
    plan: limits.plan,
    tier,
    quotas,
    active: sandboxes.filter((sandbox) => sandbox.state === "running"),
    idle: sandboxes.filter((sandbox) => sandbox.state === "paused"),
    e2bConfigured: Boolean(process.env.E2B_API_KEY),
  };
}
