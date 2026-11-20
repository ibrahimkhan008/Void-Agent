import "server-only";

import {
  type SubscriptionTierName,
  normalizeSubscriptionTier,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type CyberResearcherProfile,
  cyberRepository,
} from "lib/db/pg/repositories/cyber-repository.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { getCyberSystemConfig } from "./config";

/**
 * In-memory active concurrent agent tracker per user.
 * Enforces owner-configured `maxConcurrentAgents` across simultaneous
 * `/api/cyber/chat` and `/api/cyber/sessions/[id]/dispatch` executions.
 */
declare global {
  // eslint-disable-next-line no-var
  var _cyberRunningAgentsByUser: Map<string, number> | undefined;
}

const runningAgentsByUser =
  globalThis._cyberRunningAgentsByUser ?? new Map<string, number>();
globalThis._cyberRunningAgentsByUser = runningAgentsByUser;

export function getRunningCyberAgentCount(userId: string): number {
  return runningAgentsByUser.get(userId) ?? 0;
}

export function acquireCyberAgentSlot(
  userId: string,
  maxConcurrentAgents: number,
): { acquired: true; running: number } | { acquired: false; running: number } {
  const current = runningAgentsByUser.get(userId) ?? 0;
  if (current >= maxConcurrentAgents) {
    return { acquired: false, running: current };
  }
  const next = current + 1;
  runningAgentsByUser.set(userId, next);
  return { acquired: true, running: next };
}

export function releaseCyberAgentSlot(userId: string): void {
  const current = runningAgentsByUser.get(userId) ?? 0;
  if (current <= 1) {
    runningAgentsByUser.delete(userId);
  } else {
    runningAgentsByUser.set(userId, current - 1);
  }
}

export interface ResolvedCyberQuotas {
  subscriptionTier: SubscriptionTierName;
  planLabel: string;
  maxConcurrentAgents: number;
  maxActiveCyberSessions: number;
  isOverriddenAgents: boolean;
  isOverriddenSessions: boolean;
  runningAgents: number;
  activeCyberSessions: number;
}

export async function resolveUserCyberQuotas(
  userId: string,
  profile: CyberResearcherProfile,
): Promise<ResolvedCyberQuotas> {
  const [userRow, config, activeCyberSessions] = await Promise.all([
    db
      .select({ subscriptionTier: UserTable.tier })
      .from(UserTable)
      .where(eq(UserTable.id, userId))
      .limit(1),
    getCyberSystemConfig(),
    cyberRepository.countActiveSessionsByUser(userId),
  ]);

  const subscriptionTier = normalizeSubscriptionTier(
    userRow[0]?.subscriptionTier,
  );
  const planQuota = config.planLimits[subscriptionTier];

  const isOverriddenAgents =
    typeof profile.maxConcurrentAgents === "number" &&
    profile.maxConcurrentAgents >= 1;
  const isOverriddenSessions =
    typeof profile.maxActiveSessions === "number" &&
    profile.maxActiveSessions >= 1;

  return {
    subscriptionTier,
    planLabel: subscriptionTiersInfo[subscriptionTier]?.label ?? "Free",
    maxConcurrentAgents: isOverriddenAgents
      ? (profile.maxConcurrentAgents as number)
      : planQuota.maxConcurrentAgents,
    maxActiveCyberSessions: isOverriddenSessions
      ? (profile.maxActiveSessions as number)
      : planQuota.maxActiveCyberSessions,
    isOverriddenAgents,
    isOverriddenSessions,
    runningAgents: getRunningCyberAgentCount(userId),
    activeCyberSessions,
  };
}
