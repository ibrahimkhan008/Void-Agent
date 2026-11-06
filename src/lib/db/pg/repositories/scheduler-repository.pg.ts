import "server-only";

import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  NewScheduledJob,
  NewScheduledRun,
  ScheduledJob,
  ScheduledJobTable,
  ScheduledRun,
  ScheduledRunTable,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P3.0 schema foundation — scheduler repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `scheduled_job` + `scheduled_run` tables. The actual
// cron parser / run-execution logic lives in P3.1 (src/lib/scheduler/).
// This file is a thin data-access layer:
//   * createScheduledJob / listScheduledJobs / getScheduledJob — basic CRUD,
//     always scoped to a user.
//   * updateScheduledJob / deleteScheduledJob — owner-scoped patches.
//   * claimDueScheduledJobs — worker-facing transactional row-lock + lease
//     claim; each claim is recoverable after expiry and completion is fenced.
//   * createScheduledRun / updateScheduledRun / listScheduledRuns — runs
//     are an append-only audit trail of attempts.
// ---------------------------------------------------------------------------

export interface CreateScheduledJobInput {
  agentId?: string | null;
  name: string;
  cron: string;
  timezone?: string;
  payload?: Record<string, unknown>;
  nextRunAt: Date;
  status?: "active" | "paused" | "disabled";
}

export interface UpdateScheduledJobInput {
  name?: string;
  cron?: string;
  timezone?: string;
  payload?: Record<string, unknown>;
  nextRunAt?: Date;
  lastRunAt?: Date | null;
  status?: "active" | "paused" | "disabled";
}

export interface UpdateScheduledRunInput {
  status?: "running" | "completed" | "failed" | "skipped";
  completedAt?: Date | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
}

export const schedulerRepository = {
  async createScheduledJob(
    input: CreateScheduledJobInput,
    userId: string,
  ): Promise<ScheduledJob> {
    const [row] = await db
      .insert(ScheduledJobTable)
      .values({
        userId,
        agentId: input.agentId ?? null,
        name: input.name,
        cron: input.cron,
        timezone: input.timezone ?? "UTC",
        payload: input.payload ?? {},
        nextRunAt: input.nextRunAt,
        status: input.status ?? "active",
      } satisfies NewScheduledJob)
      .returning();
    return row as ScheduledJob;
  },

  async listScheduledJobs(userId: string): Promise<ScheduledJob[]> {
    return (await db
      .select()
      .from(ScheduledJobTable)
      .where(eq(ScheduledJobTable.userId, userId))
      .orderBy(desc(ScheduledJobTable.createdAt))) as ScheduledJob[];
  },

  async getScheduledJob(
    id: string,
    userId: string,
  ): Promise<ScheduledJob | null> {
    const [row] = await db
      .select()
      .from(ScheduledJobTable)
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      );
    return (row as ScheduledJob | undefined) ?? null;
  },

  async updateScheduledJob(
    id: string,
    userId: string,
    patch: UpdateScheduledJobInput,
  ): Promise<ScheduledJob | null> {
    const [row] = await db
      .update(ScheduledJobTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
        ...(patch.nextRunAt !== undefined
          ? { nextRunAt: patch.nextRunAt }
          : {}),
        ...(patch.lastRunAt !== undefined
          ? { lastRunAt: patch.lastRunAt }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.status === "paused" ||
        patch.status === "disabled" ||
        patch.cron !== undefined ||
        patch.nextRunAt !== undefined
          ? { claimToken: null, claimExpiresAt: null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      )
      .returning();
    return (row as ScheduledJob | undefined) ?? null;
  },

  async deleteScheduledJob(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(ScheduledJobTable)
      .where(
        and(eq(ScheduledJobTable.id, id), eq(ScheduledJobTable.userId, userId)),
      )
      .returning({ id: ScheduledJobTable.id });
    return result.length > 0;
  },

  /**
   * Worker-facing claim. FOR UPDATE SKIP LOCKED serializes concurrent
   * claimers; a persisted token/expiry fences completion and lets another
   * worker reclaim rows after a process crash.
   */
  async claimDueScheduledJobs(
    now: Date,
    limit: number,
    claimToken: string,
    leaseUntil: Date,
  ): Promise<ScheduledJob[]> {
    if (!Number.isFinite(limit) || limit <= 0) return [];

    return db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(ScheduledJobTable)
        .where(
          and(
            eq(ScheduledJobTable.status, "active"),
            lte(ScheduledJobTable.nextRunAt, now),
            or(
              isNull(ScheduledJobTable.claimExpiresAt),
              lte(ScheduledJobTable.claimExpiresAt, now),
            ),
          ),
        )
        .orderBy(ScheduledJobTable.nextRunAt)
        .limit(Math.min(100, Math.floor(limit)))
        .for("update", { skipLocked: true });

      if (due.length === 0) return [];
      const claimedIds = due.map((job) => job.id);
      const claimed = await tx
        .update(ScheduledJobTable)
        .set({ claimToken, claimExpiresAt: leaseUntil, updatedAt: now })
        .where(inArray(ScheduledJobTable.id, claimedIds))
        .returning();
      return claimed as ScheduledJob[];
    });
  },

  async renewScheduledJobClaims(
    jobIds: string[],
    claimToken: string,
    leaseUntil: Date,
  ): Promise<string[]> {
    if (jobIds.length === 0) return [];
    const rows = await db
      .update(ScheduledJobTable)
      .set({ claimExpiresAt: leaseUntil, updatedAt: new Date() })
      .where(
        and(
          inArray(ScheduledJobTable.id, jobIds),
          eq(ScheduledJobTable.claimToken, claimToken),
        ),
      )
      .returning({ id: ScheduledJobTable.id });
    return rows.map((row) => row.id);
  },

  async completeScheduledJobClaim(
    id: string,
    userId: string,
    claimToken: string,
    patch: UpdateScheduledJobInput,
  ): Promise<ScheduledJob | null> {
    const [row] = await db
      .update(ScheduledJobTable)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
        ...(patch.nextRunAt !== undefined
          ? { nextRunAt: patch.nextRunAt }
          : {}),
        ...(patch.lastRunAt !== undefined
          ? { lastRunAt: patch.lastRunAt }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        claimToken: null,
        claimExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ScheduledJobTable.id, id),
          eq(ScheduledJobTable.userId, userId),
          eq(ScheduledJobTable.claimToken, claimToken),
        ),
      )
      .returning();
    return (row as ScheduledJob | undefined) ?? null;
  },

  async releaseScheduledJobClaims(
    jobIds: string[],
    claimToken: string,
  ): Promise<void> {
    if (jobIds.length === 0) return;
    await db
      .update(ScheduledJobTable)
      .set({ claimToken: null, claimExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          inArray(ScheduledJobTable.id, jobIds),
          eq(ScheduledJobTable.claimToken, claimToken),
        ),
      );
  },

  async createScheduledRun(jobId: string): Promise<ScheduledRun> {
    const [row] = await db
      .insert(ScheduledRunTable)
      .values({
        scheduledJobId: jobId,
      } satisfies NewScheduledRun)
      .returning();
    return row as ScheduledRun;
  },

  async updateScheduledRun(
    id: string,
    patch: UpdateScheduledRunInput,
  ): Promise<ScheduledRun | null> {
    const [row] = await db
      .update(ScheduledRunTable)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.completedAt !== undefined
          ? { completedAt: patch.completedAt }
          : {}),
        ...(patch.output !== undefined ? { output: patch.output } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .where(eq(ScheduledRunTable.id, id))
      .returning();
    return (row as ScheduledRun | undefined) ?? null;
  },

  async listScheduledRuns(
    jobId: string,
    userId: string,
    limit = 50,
  ): Promise<ScheduledRun[]> {
    // Join through the job so we can enforce the owner-scope at the
    // query level — a run is only visible if its parent job belongs to
    // the calling user.
    return (await db
      .select({
        id: ScheduledRunTable.id,
        scheduledJobId: ScheduledRunTable.scheduledJobId,
        startedAt: ScheduledRunTable.startedAt,
        completedAt: ScheduledRunTable.completedAt,
        status: ScheduledRunTable.status,
        output: ScheduledRunTable.output,
        error: ScheduledRunTable.error,
      })
      .from(ScheduledRunTable)
      .innerJoin(
        ScheduledJobTable,
        eq(ScheduledRunTable.scheduledJobId, ScheduledJobTable.id),
      )
      .where(
        and(
          eq(ScheduledRunTable.scheduledJobId, jobId),
          eq(ScheduledJobTable.userId, userId),
        ),
      )
      .orderBy(sql`${ScheduledRunTable.startedAt} DESC`)
      .limit(limit)) as ScheduledRun[];
  },
};
