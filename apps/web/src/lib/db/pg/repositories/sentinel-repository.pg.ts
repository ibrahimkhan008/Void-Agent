import "server-only";

import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  SentinelIncident,
  SentinelIncidentTable,
  SentinelMonitor,
  SentinelMonitorTable,
} from "../schema.pg";

/**
 * Void Sentinel (master prompt §3.10) data access: monitors + incidents.
 * Monitors belong to one user and watch one published slug; incidents are
 * the lifecycle record for one detected failure on a monitor.
 */

export type SentinelMode = "monitor" | "suggest" | "repair_approval" | "autonomous";
export type SentinelIncidentStatus =
  | "open"
  | "diagnosed"
  | "fix_proposed"
  | "fix_deployed"
  | "resolved"
  | "rolled_back"
  | "closed";

const MODES = ["monitor", "suggest", "repair_approval", "autonomous"];
const STATUSES = [
  "open",
  "diagnosed",
  "fix_proposed",
  "fix_deployed",
  "resolved",
  "rolled_back",
  "closed",
];

export const isSentinelMode = (value: unknown): value is SentinelMode =>
  typeof value === "string" && (MODES as string[]).includes(value);
export const isSentinelStatus = (value: unknown): value is SentinelIncidentStatus =>
  typeof value === "string" && (STATUSES as string[]).includes(value);

export interface CreateSentinelMonitorInput {
  slug: string;
  mode: SentinelMode;
  assertions: Array<{ type: "status" | "contains" | "not_contains"; value: string }>;
  intervalSeconds: number;
}

export const sentinelRepository = {
  async createMonitor(
    userId: string,
    input: CreateSentinelMonitorInput,
  ): Promise<SentinelMonitor> {
    const [row] = await db
      .insert(SentinelMonitorTable)
      .values({
        userId,
        slug: input.slug,
        mode: input.mode,
        assertions: input.assertions,
        intervalSeconds: input.intervalSeconds,
      })
      .returning();
    return row;
  },

  async listMonitors(userId: string): Promise<SentinelMonitor[]> {
    return db
      .select()
      .from(SentinelMonitorTable)
      .where(eq(SentinelMonitorTable.userId, userId))
      .orderBy(desc(SentinelMonitorTable.createdAt));
  },

  async getMonitor(
    userId: string,
    id: string,
  ): Promise<SentinelMonitor | null> {
    const [row] = await db
      .select()
      .from(SentinelMonitorTable)
      .where(
        and(eq(SentinelMonitorTable.id, id), eq(SentinelMonitorTable.userId, userId)),
      )
      .limit(1);
    return row ?? null;
  },

  async updateMonitor(
    userId: string,
    id: string,
    input: {
      mode?: SentinelMode;
      enabled?: boolean;
      assertions?: Array<{ type: "status" | "contains" | "not_contains"; value: string }>;
      intervalSeconds?: number;
    },
  ): Promise<SentinelMonitor | null> {
    const [row] = await db
      .update(SentinelMonitorTable)
      .set({
        ...(input.mode ? { mode: input.mode } : {}),
        ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
        ...(input.assertions ? { assertions: input.assertions } : {}),
        ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(SentinelMonitorTable.id, id), eq(SentinelMonitorTable.userId, userId)),
      )
      .returning();
    return row ?? null;
  },

  async deleteMonitor(userId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(SentinelMonitorTable)
      .where(
        and(eq(SentinelMonitorTable.id, id), eq(SentinelMonitorTable.userId, userId)),
      )
      .returning({ id: SentinelMonitorTable.id });
    return rows.length > 0;
  },

  /** Monitors due for a probe: enabled and not checked within their interval. */
  async listDueMonitors(now: Date, limit = 20): Promise<SentinelMonitor[]> {
    const rows = await db
      .select()
      .from(SentinelMonitorTable)
      .where(eq(SentinelMonitorTable.enabled, true));
    return rows
      .filter((monitor) => {
        if (!monitor.lastCheckedAt) return true;
        const elapsed =
          (now.getTime() - new Date(monitor.lastCheckedAt).getTime()) / 1000;
        return elapsed >= monitor.intervalSeconds;
      })
      .slice(0, limit);
  },

  async markProbed(
    monitorId: string,
    status: "healthy" | "broken",
    checkedAt: Date,
  ): Promise<void> {
    await db
      .update(SentinelMonitorTable)
      .set({ lastStatus: status, lastCheckedAt: checkedAt, updatedAt: new Date() })
      .where(eq(SentinelMonitorTable.id, monitorId));
  },

  async createIncident(input: {
    monitorId: string;
    userId: string;
    slug: string;
    failureSignature: string;
  }): Promise<SentinelIncident> {
    const [row] = await db
      .insert(SentinelIncidentTable)
      .values({
        monitorId: input.monitorId,
        userId: input.userId,
        slug: input.slug,
        status: "open",
        failureSignature: input.failureSignature,
      })
      .returning();
    return row;
  },

  async updateIncident(
    incidentId: string,
    input: {
      status?: SentinelIncidentStatus;
      diagnosis?: string | null;
      fixSummary?: string | null;
      fixHtml?: string | null;
      deployedVersion?: number | null;
      previousVersion?: number | null;
      verification?: Array<{ type: string; passed: boolean; detail?: string }> | null;
    },
  ): Promise<SentinelIncident | null> {
    const [row] = await db
      .update(SentinelIncidentTable)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
        ...(input.fixSummary !== undefined ? { fixSummary: input.fixSummary } : {}),
        ...(input.fixHtml !== undefined ? { fixHtml: input.fixHtml } : {}),
        ...(input.deployedVersion !== undefined
          ? { deployedVersion: input.deployedVersion }
          : {}),
        ...(input.previousVersion !== undefined
          ? { previousVersion: input.previousVersion }
          : {}),
        ...(input.verification !== undefined
          ? { verification: input.verification }
          : {}),
        ...(input.status === "resolved"
          ? { resolvedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(SentinelIncidentTable.id, incidentId))
      .returning();
    return row ?? null;
  },

  async listIncidents(userId: string): Promise<SentinelIncident[]> {
    return db
      .select()
      .from(SentinelIncidentTable)
      .where(eq(SentinelIncidentTable.userId, userId))
      .orderBy(desc(SentinelIncidentTable.detectedAt));
  },

  async getIncident(
    userId: string,
    incidentId: string,
  ): Promise<SentinelIncident | null> {
    const [row] = await db
      .select()
      .from(SentinelIncidentTable)
      .where(
        and(
          eq(SentinelIncidentTable.id, incidentId),
          eq(SentinelIncidentTable.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /** Open (unresolved, unclosed) incidents for the repair loop, per monitor. */
  async listActiveIncidents(limit = 10): Promise<SentinelIncident[]> {
    return db
      .select()
      .from(SentinelIncidentTable)
      .where(
        and(
          inArray(SentinelIncidentTable.status, [
            "open",
            "diagnosed",
            "fix_proposed",
            "fix_deployed",
          ]),
        ),
      )
      .orderBy(desc(SentinelIncidentTable.detectedAt))
      .limit(limit);
  },

  /** The live (non-revoked) monitor's slug's current incident, if any. */
  async findOpenIncidentByMonitor(
    monitorId: string,
  ): Promise<SentinelIncident | null> {
    const [row] = await db
      .select()
      .from(SentinelIncidentTable)
      .where(
        and(
          eq(SentinelIncidentTable.monitorId, monitorId),
          ne(SentinelIncidentTable.status, "resolved"),
          ne(SentinelIncidentTable.status, "closed"),
        ),
      )
      .orderBy(desc(SentinelIncidentTable.detectedAt))
      .limit(1);
    return row ?? null;
  },

  async countOpenIncidents(): Promise<number> {
    const rows = await db
      .select({ id: SentinelIncidentTable.id })
      .from(SentinelIncidentTable)
      .where(
        and(
          ne(SentinelIncidentTable.status, "resolved"),
          ne(SentinelIncidentTable.status, "closed"),
          isNull(SentinelIncidentTable.resolvedAt),
        ),
      );
    return rows.length;
  },
};
