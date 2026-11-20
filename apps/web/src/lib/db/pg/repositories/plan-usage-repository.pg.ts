import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { PlanUsageTable } from "../schema.pg";

/**
 * Weekly plan-usage counters (agent launches, scheduled runs, agent tokens)
 * keyed by the Monday-UTC week. Fire-and-forget friendly: a failed counter
 * must never break the run it is counting.
 */

export type PlanUsageMetric =
  | "agent_launches"
  | "scheduled_runs"
  | "agent_tokens";

export const PLAN_USAGE_METRICS: PlanUsageMetric[] = [
  "agent_launches",
  "scheduled_runs",
  "agent_tokens",
];

export const planUsageRepository = {
  /** Atomic increment; creates the row on first use. Never throws upward. */
  async increment(
    userId: string,
    metric: PlanUsageMetric,
    periodKey: string,
    amount = 1,
  ): Promise<void> {
    try {
      await db
        .insert(PlanUsageTable)
        .values({ userId, metric, periodKey, used: amount })
        .onConflictDoUpdate({
          target: [
            PlanUsageTable.userId,
            PlanUsageTable.metric,
            PlanUsageTable.periodKey,
          ],
          set: {
            used: sql`${PlanUsageTable.used} + ${amount}`,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      // Counting must never break the run being counted.
      console.error(
        `[plan-usage] increment failed for ${metric}/${periodKey}`,
        error instanceof Error ? error.message : error,
      );
    }
  },

  /** Usage rows for one user across the requested metrics + period. */
  async getUsage(
    userId: string,
    metrics: PlanUsageMetric[],
    periodKey: string,
  ): Promise<Record<PlanUsageMetric, number>> {
    const rows = await db
      .select({
        metric: PlanUsageTable.metric,
        used: PlanUsageTable.used,
      })
      .from(PlanUsageTable)
      .where(
        and(
          eq(PlanUsageTable.userId, userId),
          eq(PlanUsageTable.periodKey, periodKey),
          inArray(PlanUsageTable.metric, metrics),
        ),
      );
    const result = Object.fromEntries(
      metrics.map((metric) => [metric, 0]),
    ) as Record<PlanUsageMetric, number>;
    for (const row of rows) {
      if (row.metric in result) {
        result[row.metric as PlanUsageMetric] = Number(row.used ?? 0);
      }
    }
    return result;
  },
};
