import "server-only";

import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  NewScheduledJob,
  NewScheduledRun,
  ScheduledJob,
  ScheduledJobCreationRequestTable,
  ScheduledJobManualRunRequestTable,
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

export interface ScheduledJobIdempotency {
  requestKey: string;
  requestHash: string;
}

export class ScheduledJobIdempotencyConflictError extends Error {
  constructor() {
    super("The schedule approval key was already used for different data.");
    this.name = "ScheduledJobIdempotencyConflictError";
  }
}

export class ScheduledJobReplayUnavailableError extends Error {
  constructor() {
    super("The schedule from this approval was deleted; start a new proposal.");
    this.name = "ScheduledJobReplayUnavailableError";
  }
}

export class ManualScheduledRunConflictError extends Error {
  constructor(message = "A manual run is already queued for this schedule.") {
    super(message);
    this.name = "ManualScheduledRunConflictError";
  }
}

export class ManualScheduledRunUnavailableError extends Error {
  constructor() {
    super("This schedule cannot be run manually.");
    this.name = "ManualScheduledRunUnavailableError";
  }
}

export class ManualScheduledRunIdempotencyConflictError extends Error {
  constructor() {
    super("The manual run key was already used for another schedule.");
    this.name = "ManualScheduledRunIdempotencyConflictError";
  }
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
  async requestManualScheduledRun(
    jobId: string,
    userId: string,
    requestKey: string,
  ): Promise<{
    id: string;
    status: string;
    created: boolean;
  }> {
    return db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(ScheduledJobTable)
        .where(
          and(
            eq(ScheduledJobTable.id, jobId),
            eq(ScheduledJobTable.userId, userId),
          ),
        )
        .for("update");
      if (!job) throw new ManualScheduledRunUnavailableError();

      const requestHash = jobId;
      const [existing] = await tx
        .select()
        .from(ScheduledJobManualRunRequestTable)
        .where(
          and(
            eq(ScheduledJobManualRunRequestTable.userId, userId),
            eq(ScheduledJobManualRunRequestTable.requestKey, requestKey),
          ),
        )
        .for("update");
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ManualScheduledRunIdempotencyConflictError();
        }
        if (!existing.scheduledJobId) {
          throw new ScheduledJobReplayUnavailableError();
        }
        return { id: existing.id, status: existing.status, created: false };
      }

      if (job.status === "disabled") {
        throw new ManualScheduledRunUnavailableError();
      }
      const [pending] = await tx
        .select({ id: ScheduledJobManualRunRequestTable.id })
        .from(ScheduledJobManualRunRequestTable)
        .where(
          and(
            eq(ScheduledJobManualRunRequestTable.scheduledJobId, jobId),
            inArray(ScheduledJobManualRunRequestTable.status, [
              "pending",
              "processing",
            ]),
          ),
        )
        .limit(1);
      if (pending) throw new ManualScheduledRunConflictError();

      const [request] = await tx
        .insert(ScheduledJobManualRunRequestTable)
        .values({ userId, scheduledJobId: jobId, requestKey, requestHash })
        .onConflictDoNothing()
        .returning();
      if (request) {
        return { id: request.id, status: request.status, created: true };
      }

      // A concurrent request may have reserved this key while another job
      // row was locked. Resolve it rather than accidentally creating work.
      const [replayed] = await tx
        .select()
        .from(ScheduledJobManualRunRequestTable)
        .where(
          and(
            eq(ScheduledJobManualRunRequestTable.userId, userId),
            eq(ScheduledJobManualRunRequestTable.requestKey, requestKey),
          ),
        );
      if (!replayed) throw new Error("Manual run request could not be saved.");
      if (replayed.requestHash !== requestHash) {
        throw new ManualScheduledRunIdempotencyConflictError();
      }
      if (!replayed.scheduledJobId) {
        throw new ScheduledJobReplayUnavailableError();
      }
      return { id: replayed.id, status: replayed.status, created: false };
    });
  },

  async claimManualScheduledRuns(
    now: Date,
    limit: number,
    claimToken: string,
    leaseUntil: Date,
  ): Promise<Array<{ job: ScheduledJob; requestId: string; runId: string }>> {
    if (!Number.isFinite(limit) || limit <= 0) return [];
    return db.transaction(async (tx) => {
      const candidates = await tx
        .select({
          request: ScheduledJobManualRunRequestTable,
          job: ScheduledJobTable,
        })
        .from(ScheduledJobManualRunRequestTable)
        .innerJoin(
          ScheduledJobTable,
          eq(
            ScheduledJobTable.id,
            ScheduledJobManualRunRequestTable.scheduledJobId,
          ),
        )
        .where(
          and(
            inArray(ScheduledJobTable.status, ["active", "paused"]),
            or(
              eq(ScheduledJobManualRunRequestTable.status, "pending"),
              and(
                eq(ScheduledJobManualRunRequestTable.status, "processing"),
                or(
                  isNull(ScheduledJobManualRunRequestTable.claimExpiresAt),
                  lte(ScheduledJobManualRunRequestTable.claimExpiresAt, now),
                ),
              ),
            ),
            or(
              isNull(ScheduledJobTable.claimExpiresAt),
              lte(ScheduledJobTable.claimExpiresAt, now),
            ),
          ),
        )
        .orderBy(ScheduledJobManualRunRequestTable.createdAt)
        .limit(Math.min(100, Math.floor(limit)))
        .for("update", { skipLocked: true });

      const claimed: Array<{
        job: ScheduledJob;
        requestId: string;
        runId: string;
      }> = [];
      for (const candidate of candidates) {
        if (
          candidate.request.status === "processing" &&
          candidate.request.scheduledRunId
        ) {
          const crashMessage =
            "Worker lease expired after execution started; request was not replayed to avoid duplicate side effects.";
          await tx
            .update(ScheduledJobManualRunRequestTable)
            .set({
              status: "failed",
              claimToken: null,
              claimExpiresAt: null,
              lastError: crashMessage,
              updatedAt: now,
            })
            .where(
              eq(ScheduledJobManualRunRequestTable.id, candidate.request.id),
            );
          await tx
            .update(ScheduledRunTable)
            .set({
              status: "failed",
              completedAt: now,
              error: crashMessage,
            })
            .where(eq(ScheduledRunTable.id, candidate.request.scheduledRunId));
          continue;
        }

        const [job] = await tx
          .update(ScheduledJobTable)
          .set({ claimToken, claimExpiresAt: leaseUntil, updatedAt: now })
          .where(
            and(
              eq(ScheduledJobTable.id, candidate.job.id),
              or(
                isNull(ScheduledJobTable.claimExpiresAt),
                lte(ScheduledJobTable.claimExpiresAt, now),
              ),
            ),
          )
          .returning();
        if (!job) continue;
        const [run] = await tx
          .insert(ScheduledRunTable)
          .values({ scheduledJobId: job.id } satisfies NewScheduledRun)
          .returning();
        if (!run) {
          await tx
            .update(ScheduledJobTable)
            .set({ claimToken: null, claimExpiresAt: null, updatedAt: now })
            .where(
              and(
                eq(ScheduledJobTable.id, job.id),
                eq(ScheduledJobTable.claimToken, claimToken),
              ),
            );
          continue;
        }
        const [request] = await tx
          .update(ScheduledJobManualRunRequestTable)
          .set({
            status: "processing",
            attempts: candidate.request.attempts + 1,
            claimToken,
            claimExpiresAt: leaseUntil,
            scheduledRunId: run.id,
            updatedAt: now,
          })
          .where(eq(ScheduledJobManualRunRequestTable.id, candidate.request.id))
          .returning();
        if (!request) {
          await tx
            .update(ScheduledJobTable)
            .set({ claimToken: null, claimExpiresAt: null, updatedAt: now })
            .where(
              and(
                eq(ScheduledJobTable.id, job.id),
                eq(ScheduledJobTable.claimToken, claimToken),
              ),
            );
          continue;
        }
        claimed.push({
          job: job as ScheduledJob,
          requestId: request.id,
          runId: run.id,
        });
      }
      return claimed;
    });
  },

  async finishManualScheduledRun(
    requestId: string,
    claimToken: string,
    runId: string,
    status: "completed" | "failed",
    error?: string,
  ): Promise<boolean> {
    const [row] = await db
      .update(ScheduledJobManualRunRequestTable)
      .set({
        status,
        scheduledRunId: runId,
        claimToken: null,
        claimExpiresAt: null,
        lastError: error?.slice(0, 1000) ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ScheduledJobManualRunRequestTable.id, requestId),
          eq(ScheduledJobManualRunRequestTable.claimToken, claimToken),
        ),
      )
      .returning({ id: ScheduledJobManualRunRequestTable.id });
    return Boolean(row);
  },

  async createScheduledJob(
    input: CreateScheduledJobInput,
    userId: string,
    idempotency?: ScheduledJobIdempotency,
  ): Promise<ScheduledJob> {
    if (idempotency) {
      return db.transaction(async (tx) => {
        const [reservation] = await tx
          .insert(ScheduledJobCreationRequestTable)
          .values({
            userId,
            requestKey: idempotency.requestKey,
            requestHash: idempotency.requestHash,
          })
          .onConflictDoNothing()
          .returning();

        if (!reservation) {
          const [existingRequest] = await tx
            .select()
            .from(ScheduledJobCreationRequestTable)
            .where(
              and(
                eq(ScheduledJobCreationRequestTable.userId, userId),
                eq(
                  ScheduledJobCreationRequestTable.requestKey,
                  idempotency.requestKey,
                ),
              ),
            )
            .for("update");
          if (!existingRequest) {
            throw new Error("Schedule approval retry could not be resolved.");
          }
          if (existingRequest.requestHash !== idempotency.requestHash) {
            throw new ScheduledJobIdempotencyConflictError();
          }
          if (!existingRequest.scheduledJobId) {
            throw new ScheduledJobReplayUnavailableError();
          }
          const [existingJob] = await tx
            .select()
            .from(ScheduledJobTable)
            .where(
              and(
                eq(ScheduledJobTable.id, existingRequest.scheduledJobId),
                eq(ScheduledJobTable.userId, userId),
              ),
            );
          if (!existingJob) throw new ScheduledJobReplayUnavailableError();
          return existingJob as ScheduledJob;
        }

        const [job] = await tx
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
        if (!job) throw new Error("Could not create the approved schedule.");
        await tx
          .update(ScheduledJobCreationRequestTable)
          .set({ scheduledJobId: job.id })
          .where(
            and(
              eq(ScheduledJobCreationRequestTable.userId, userId),
              eq(
                ScheduledJobCreationRequestTable.requestKey,
                idempotency.requestKey,
              ),
            ),
          );
        return job as ScheduledJob;
      });
    }

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
    await db
      .update(ScheduledJobManualRunRequestTable)
      .set({ claimExpiresAt: leaseUntil, updatedAt: new Date() })
      .where(
        and(
          inArray(ScheduledJobManualRunRequestTable.scheduledJobId, jobIds),
          eq(ScheduledJobManualRunRequestTable.claimToken, claimToken),
          eq(ScheduledJobManualRunRequestTable.status, "processing"),
        ),
      );
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
