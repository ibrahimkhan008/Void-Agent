import "server-only";

import { pgDb } from "@/lib/db/pg/db.pg";
import {
  type ScheduledTaskManualRunRequest,
  ScheduledTaskManualRunRequestTable,
  ScheduledTaskTable,
} from "@/lib/db/pg/schema.pg";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

export const MANUAL_RUN_LEASE_MS = 6 * 60 * 1000;
export const MANUAL_RUN_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export class ManualTaskRunUnavailableError extends Error {
  constructor() {
    super("Scheduled task not found or unavailable.");
    this.name = "ManualTaskRunUnavailableError";
  }
}

export class ManualTaskRunConflictError extends Error {
  constructor() {
    super("A manual run is already in progress for this task.");
    this.name = "ManualTaskRunConflictError";
  }
}

export class ManualTaskRunIdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key was already used for a different task.");
    this.name = "ManualTaskRunIdempotencyConflictError";
  }
}

export class ManualTaskRunReplayUnavailableError extends Error {
  constructor() {
    super("The scheduled task was deleted after this request was recorded.");
    this.name = "ManualTaskRunReplayUnavailableError";
  }
}

export interface ManualTaskRunOutcome {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  threadId?: string | null;
}

export type ManualTaskRunRequestSummary = Pick<
  ScheduledTaskManualRunRequest,
  "id" | "status" | "outcome" | "error"
>;

/**
 * Queue a manual run under the task owner. The task row lock serializes
 * different idempotency keys for the same task; database unique indexes
 * serialize duplicate keys and active requests across processes.
 */
export async function queueManualTaskRun(
  taskId: string,
  userId: string,
  requestKey: string,
): Promise<ManualTaskRunRequestSummary> {
  if (!MANUAL_RUN_IDEMPOTENCY_KEY_PATTERN.test(requestKey)) {
    throw new TypeError("A valid manual-run idempotency key is required.");
  }

  return pgDb.transaction(async (tx) => {
    const requestHash = taskId;
    const [existing] = await tx
      .select()
      .from(ScheduledTaskManualRunRequestTable)
      .where(
        and(
          eq(ScheduledTaskManualRunRequestTable.userId, userId),
          eq(ScheduledTaskManualRunRequestTable.requestKey, requestKey),
        ),
      )
      .for("update");

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ManualTaskRunIdempotencyConflictError();
      }
      if (!existing.scheduledTaskId) {
        throw new ManualTaskRunReplayUnavailableError();
      }
      return summarize(existing);
    }

    const [task] = await tx
      .select({ id: ScheduledTaskTable.id })
      .from(ScheduledTaskTable)
      .where(
        and(
          eq(ScheduledTaskTable.id, taskId),
          eq(ScheduledTaskTable.userId, userId),
        ),
      )
      .for("update");
    if (!task) throw new ManualTaskRunUnavailableError();

    const now = new Date();
    // A timed-out serverless request may leave a stale active row. Fence it
    // terminal before releasing the per-task active uniqueness constraint.
    await tx
      .update(ScheduledTaskManualRunRequestTable)
      .set({
        status: "failed",
        error: "Manual run lease expired before completion.",
        claimToken: null,
        claimExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(ScheduledTaskManualRunRequestTable.scheduledTaskId, taskId),
          eq(ScheduledTaskManualRunRequestTable.status, "processing"),
          or(
            isNull(ScheduledTaskManualRunRequestTable.claimExpiresAt),
            lte(ScheduledTaskManualRunRequestTable.claimExpiresAt, now),
          ),
        ),
      );

    const [active] = await tx
      .select({ id: ScheduledTaskManualRunRequestTable.id })
      .from(ScheduledTaskManualRunRequestTable)
      .where(
        and(
          eq(ScheduledTaskManualRunRequestTable.scheduledTaskId, taskId),
          inArray(ScheduledTaskManualRunRequestTable.status, [
            "pending",
            "processing",
          ]),
        ),
      )
      .limit(1);
    if (active) throw new ManualTaskRunConflictError();

    const [inserted] = await tx
      .insert(ScheduledTaskManualRunRequestTable)
      .values({ scheduledTaskId: taskId, userId, requestKey, requestHash })
      .onConflictDoNothing()
      .returning();

    if (inserted) return summarize(inserted);

    // A duplicate key can be reserved concurrently on a different task row.
    const [replayed] = await tx
      .select()
      .from(ScheduledTaskManualRunRequestTable)
      .where(
        and(
          eq(ScheduledTaskManualRunRequestTable.userId, userId),
          eq(ScheduledTaskManualRunRequestTable.requestKey, requestKey),
        ),
      )
      .for("update");
    if (!replayed) throw new Error("Manual run request could not be saved.");
    if (replayed.requestHash !== requestHash) {
      throw new ManualTaskRunIdempotencyConflictError();
    }
    if (!replayed.scheduledTaskId) {
      throw new ManualTaskRunReplayUnavailableError();
    }
    return summarize(replayed);
  });
}

/** Atomically claims pending or expired work and fences the caller by token. */
export async function claimManualTaskRun(
  requestId: string,
  claimToken: string,
  now = new Date(),
): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + MANUAL_RUN_LEASE_MS);
  const [claimed] = await pgDb
    .update(ScheduledTaskManualRunRequestTable)
    .set({
      status: "processing",
      claimToken,
      claimExpiresAt: leaseUntil,
      attempts: sql`${ScheduledTaskManualRunRequestTable.attempts} + 1`,
      updatedAt: now,
      error: null,
    })
    .where(
      and(
        eq(ScheduledTaskManualRunRequestTable.id, requestId),
        or(
          eq(ScheduledTaskManualRunRequestTable.status, "pending"),
          and(
            eq(ScheduledTaskManualRunRequestTable.status, "processing"),
            or(
              isNull(ScheduledTaskManualRunRequestTable.claimExpiresAt),
              lte(ScheduledTaskManualRunRequestTable.claimExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning({ id: ScheduledTaskManualRunRequestTable.id });
  return !!claimed;
}

export async function completeManualTaskRun(
  requestId: string,
  claimToken: string,
  outcome: ManualTaskRunOutcome,
): Promise<void> {
  const now = new Date();
  const [completed] = await pgDb
    .update(ScheduledTaskManualRunRequestTable)
    .set({
      status: "completed",
      outcome: { ...outcome },
      claimToken: null,
      claimExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(ScheduledTaskManualRunRequestTable.id, requestId),
        eq(ScheduledTaskManualRunRequestTable.claimToken, claimToken),
        eq(ScheduledTaskManualRunRequestTable.status, "processing"),
      ),
    )
    .returning({ id: ScheduledTaskManualRunRequestTable.id });
  if (!completed)
    throw new Error("Manual run claim was lost before completion.");
}

export async function failManualTaskRun(
  requestId: string,
  claimToken: string,
  error: string,
): Promise<void> {
  const now = new Date();
  await pgDb
    .update(ScheduledTaskManualRunRequestTable)
    .set({
      status: "failed",
      error: error.slice(0, 2_000),
      claimToken: null,
      claimExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(ScheduledTaskManualRunRequestTable.id, requestId),
        eq(ScheduledTaskManualRunRequestTable.claimToken, claimToken),
        eq(ScheduledTaskManualRunRequestTable.status, "processing"),
      ),
    );
}

export async function getManualTaskRunRequest(
  requestId: string,
  userId: string,
): Promise<ManualTaskRunRequestSummary | null> {
  const [request] = await pgDb
    .select()
    .from(ScheduledTaskManualRunRequestTable)
    .where(
      and(
        eq(ScheduledTaskManualRunRequestTable.id, requestId),
        eq(ScheduledTaskManualRunRequestTable.userId, userId),
      ),
    )
    .limit(1);
  return request ? summarize(request) : null;
}

function summarize(
  request: ScheduledTaskManualRunRequest,
): ManualTaskRunRequestSummary {
  return {
    id: request.id,
    status: request.status,
    outcome: request.outcome,
    error: request.error,
  };
}
