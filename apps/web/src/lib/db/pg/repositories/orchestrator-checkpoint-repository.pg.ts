import type { UserPreferences } from "app-types/user";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  OrchestratorDailyQuotaError,
  orchestratorDailyRunLimit,
  utcDayStart,
} from "lib/ai/orchestrator/quota";
import { pgDb } from "lib/db/pg/db.pg";
import { OrchestratorCheckpointTable, UserTable } from "lib/db/pg/schema.pg";

export type StoredOrchestratorWorker = {
  key: string;
  role: "research" | "build" | "test";
  name: string;
  task: string;
  dependsOn?: string[];
};

export type StoredOrchestratorResult = {
  key: string;
  name: string;
  role: "research" | "build" | "test";
  status: "succeeded" | "failed";
  summary: string;
  attempts: number;
  toolCallCount: number;
  artifacts?: Array<{ path: string; content: string }>;
};

export async function createOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
  objective: string;
  workers: StoredOrchestratorWorker[];
  verificationCriteria?: string;
}) {
  const [checkpoint] = await pgDb
    .insert(OrchestratorCheckpointTable)
    .values(input)
    .returning({ id: OrchestratorCheckpointTable.id });
  if (!checkpoint) throw new Error("Orchestrator checkpoint was not created");
  return checkpoint;
}

/**
 * Atomically enforce a user's daily orchestration quota and create a run.
 * A transaction-scoped advisory lock serializes simultaneous starts for one
 * user, so concurrent requests cannot exceed the limit. Checkpoint resumes do
 * not call this function and therefore do not consume another daily run.
 */
export async function createOrchestratorCheckpointWithinQuota(input: {
  id: string;
  userId: string;
  threadId: string;
  objective: string;
  workers: StoredOrchestratorWorker[];
  verificationCriteria?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return pgDb.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.userId}), 809041)`,
    );
    const [user] = await tx
      .select({ tier: UserTable.tier, preferences: UserTable.preferences })
      .from(UserTable)
      .where(eq(UserTable.id, input.userId))
      .for("update")
      .limit(1);
    if (!user) throw new Error("Orchestrator account was not found");

    const preferences = (user.preferences ?? {}) as Record<string, unknown>;
    const currentUsage = preferences.orchestratorDailyUsage as
      | { day?: unknown; used?: unknown }
      | undefined;
    const today = utcDayStart(now).toISOString().slice(0, 10);
    const used =
      currentUsage?.day === today &&
      typeof currentUsage.used === "number" &&
      Number.isFinite(currentUsage.used)
        ? Math.max(0, Math.floor(currentUsage.used))
        : 0;
    const limit = orchestratorDailyRunLimit(user.tier);
    if (used >= limit) throw new OrchestratorDailyQuotaError(limit, used);

    await tx
      .update(UserTable)
      .set({
        preferences: {
          ...preferences,
          orchestratorDailyUsage: { day: today, used: used + 1 },
        } as UserPreferences,
      })
      .where(eq(UserTable.id, input.userId));

    const [checkpoint] = await tx
      .insert(OrchestratorCheckpointTable)
      .values({
        id: input.id,
        userId: input.userId,
        threadId: input.threadId,
        objective: input.objective,
        workers: input.workers,
        verificationCriteria: input.verificationCriteria,
      })
      .returning({ id: OrchestratorCheckpointTable.id });
    if (!checkpoint) throw new Error("Orchestrator checkpoint was not created");
    return { ...checkpoint, used: used + 1, limit };
  });
}

export async function getOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
}) {
  const [checkpoint] = await pgDb
    .select()
    .from(OrchestratorCheckpointTable)
    .where(
      and(
        eq(OrchestratorCheckpointTable.id, input.id),
        eq(OrchestratorCheckpointTable.userId, input.userId),
        eq(OrchestratorCheckpointTable.threadId, input.threadId),
      ),
    )
    .limit(1);
  return checkpoint ?? null;
}

/**
 * Atomically claim a failed checkpoint for resume. A crashed worker can be
 * reclaimed after ten minutes without allowing two live requests to execute
 * the same unfinished workers concurrently. Orchestrator runs are bounded to
 * six minutes, so the stale window leaves room for normal execution.
 */
export async function claimOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const [checkpoint] = await pgDb
    .update(OrchestratorCheckpointTable)
    .set({ status: "running", updatedAt: now })
    .where(
      and(
        eq(OrchestratorCheckpointTable.id, input.id),
        eq(OrchestratorCheckpointTable.userId, input.userId),
        eq(OrchestratorCheckpointTable.threadId, input.threadId),
        or(
          eq(OrchestratorCheckpointTable.status, "failed"),
          and(
            inArray(OrchestratorCheckpointTable.status, [
              "running",
              "verifying",
            ]),
            lte(OrchestratorCheckpointTable.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();
  return checkpoint ?? null;
}

export async function saveOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
  completedWorkers: StoredOrchestratorResult[];
  status: "running" | "verifying" | "failed" | "done";
}) {
  const [checkpoint] = await pgDb
    .update(OrchestratorCheckpointTable)
    .set({
      completedWorkers: input.completedWorkers,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(OrchestratorCheckpointTable.id, input.id),
        eq(OrchestratorCheckpointTable.userId, input.userId),
        eq(OrchestratorCheckpointTable.threadId, input.threadId),
      ),
    )
    .returning({ id: OrchestratorCheckpointTable.id });
  if (!checkpoint) throw new Error("Orchestrator checkpoint was not found");
}
