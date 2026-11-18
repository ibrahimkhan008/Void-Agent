import type { SubscriptionTierName } from "app-types/subscription";

/**
 * Device plan limits (the "What each plan includes" table). Usage is counted
 * per plan; weekly metrics reset Monday 00:00 UTC, swarm launches reset
 * daily at UTC midnight (the orchestrator quota module owns that counter).
 *
 * The user-facing plan names map onto the subscription tiers as:
 *   Free → free · Plus → voidagent-pro · Pro → voidagent-max ·
 *   Scale → voidagent-enterprises(+pro/max)
 */

export interface DevicePlanLimits {
  plan: "Free" | "Plus" | "Pro" | "Scale";
  agentLaunchesPerWeek: number;
  sandboxCpuHoursPerWeek: number;
  agentTokensPerWeek: number;
  swarmLaunchesPerDay: number;
  scheduledRunsPerWeek: number;
}

export const DEVICE_PLAN_LIMITS: Record<
  SubscriptionTierName,
  DevicePlanLimits
> = {
  free: {
    plan: "Free",
    agentLaunchesPerWeek: 1,
    sandboxCpuHoursPerWeek: 1,
    agentTokensPerWeek: 25_000,
    swarmLaunchesPerDay: 2,
    scheduledRunsPerWeek: 8,
  },
  "voidagent-pro": {
    plan: "Plus",
    agentLaunchesPerWeek: 5,
    sandboxCpuHoursPerWeek: 2,
    agentTokensPerWeek: 250_000,
    swarmLaunchesPerDay: 15,
    scheduledRunsPerWeek: 75,
  },
  "voidagent-max": {
    plan: "Pro",
    agentLaunchesPerWeek: 15,
    sandboxCpuHoursPerWeek: 4,
    agentTokensPerWeek: 750_000,
    swarmLaunchesPerDay: 50,
    scheduledRunsPerWeek: 250,
  },
  "voidagent-enterprises": {
    plan: "Scale",
    agentLaunchesPerWeek: 50,
    sandboxCpuHoursPerWeek: 13,
    agentTokensPerWeek: 2_500_000,
    swarmLaunchesPerDay: 200,
    scheduledRunsPerWeek: 1_250,
  },
  "voidagent-enterprises-pro": {
    plan: "Scale",
    agentLaunchesPerWeek: 50,
    sandboxCpuHoursPerWeek: 13,
    agentTokensPerWeek: 2_500_000,
    swarmLaunchesPerDay: 200,
    scheduledRunsPerWeek: 1_250,
  },
  "voidagent-enterprises-max": {
    plan: "Scale",
    agentLaunchesPerWeek: 50,
    sandboxCpuHoursPerWeek: 13,
    agentTokensPerWeek: 2_500_000,
    swarmLaunchesPerDay: 200,
    scheduledRunsPerWeek: 1_250,
  },
};

export function devicePlanLimits(
  tier: string | null | undefined,
): DevicePlanLimits {
  return (
    DEVICE_PLAN_LIMITS[tier as SubscriptionTierName] ?? DEVICE_PLAN_LIMITS.free
  );
}

/** The Monday 00:00 UTC that opens the current weekly usage window. */
export function weekKey(now = new Date()): string {
  const day = now.getUTCDay(); // 0 = Sunday
  const mondayUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - ((day + 6) % 7),
    ),
  );
  return mondayUtc.toISOString().slice(0, 10);
}

/** When the current weekly window rolls over (next Monday 00:00 UTC). */
export function nextWeeklyReset(now = new Date()): Date {
  const day = now.getUTCDay();
  const nextMondayUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + ((8 - day) % 7 || 7),
    ),
  );
  return nextMondayUtc;
}

/** When the current daily (swarm) window rolls over — next UTC midnight. */
export function nextDailyReset(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}
