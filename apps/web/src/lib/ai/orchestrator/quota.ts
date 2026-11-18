import type { SubscriptionTierName } from "app-types/subscription";

/** Daily top-level orchestration runs by account tier. Resumes do not count. */
export const ORCHESTRATOR_DAILY_RUN_LIMITS: Record<
  SubscriptionTierName,
  number
> = {
  free: 2,
  "voidagent-pro": 15,
  "voidagent-max": 50,
  "voidagent-enterprises": 200,
  "voidagent-enterprises-pro": 200,
  "voidagent-enterprises-max": 200,
};

export function orchestratorDailyRunLimit(
  tier: string | null | undefined,
): number {
  return (
    ORCHESTRATOR_DAILY_RUN_LIMITS[tier as SubscriptionTierName] ??
    ORCHESTRATOR_DAILY_RUN_LIMITS.free
  );
}

/** UTC reset boundary shared by every server region. */
export function utcDayStart(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export class OrchestratorDailyQuotaError extends Error {
  constructor(
    readonly limit: number,
    readonly used: number,
  ) {
    super(`Daily orchestration limit reached (${used}/${limit}).`);
    this.name = "OrchestratorDailyQuotaError";
  }
}
