import { and, count, desc, eq, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { HookRunTable, InboundEndpointTable } from "../schema.pg";

/**
 * Void Hooks (master prompt §3.5) repository: the audit + idempotency layer
 * for event-driven agent runs. One hook_run row per claimed
 * `inbound.received` outbox event — the UNIQUE (event_id) constraint makes
 * dispatch idempotent across concurrent tick drivers, and every loop-
 * prevention decision (cooldown, daily cap) is recorded as a `skipped` run so
 * the user can SEE why an event did not execute.
 */

export type HookRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface HookRunRow {
  id: string;
  eventId: string;
  inboundEndpointId: string;
  agentId: string;
  userId: string;
  status: HookRunStatus;
  threadId: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/**
 * Idempotent dispatch: creates the run row for an outbox event, or returns
 * `created: false` when this event already has one (concurrent tick drivers
 * race here — the UNIQUE constraint is the arbiter).
 */
export async function createHookRun(input: {
  eventId: string;
  inboundEndpointId: string;
  agentId: string;
  userId: string;
}): Promise<{ created: boolean; runId: string | null; run?: HookRunRow }> {
  const inserted = await pgDb
    .insert(HookRunTable)
    .values({
      eventId: input.eventId,
      inboundEndpointId: input.inboundEndpointId,
      agentId: input.agentId,
      userId: input.userId,
      status: "queued",
    })
    .onConflictDoNothing({ target: HookRunTable.eventId })
    .returning();

  if (inserted.length) {
    return {
      created: true,
      runId: inserted[0].id,
      run: inserted[0] as HookRunRow,
    };
  }
  const [existing] = await pgDb
    .select()
    .from(HookRunTable)
    .where(eq(HookRunTable.eventId, input.eventId))
    .limit(1);
  return {
    created: false,
    runId: existing?.id ?? null,
    run: existing as HookRunRow | undefined,
  };
}

export async function startHookRun(runId: string): Promise<void> {
  await pgDb
    .update(HookRunTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(HookRunTable.id, runId));
}

export async function finishHookRun(
  runId: string,
  outcome: {
    status: Extract<HookRunStatus, "succeeded" | "failed" | "skipped">;
    threadId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await pgDb
    .update(HookRunTable)
    .set({
      status: outcome.status,
      threadId: outcome.threadId ?? null,
      error: outcome.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(HookRunTable.id, runId));
}

export async function getHookRunById(
  runId: string,
): Promise<HookRunRow | null> {
  const [row] = await pgDb
    .select()
    .from(HookRunTable)
    .where(eq(HookRunTable.id, runId))
    .limit(1);
  return (row as HookRunRow) ?? null;
}

/** Recent runs for a user (newest first). */
export async function listHookRuns(
  userId: string,
  limit = 50,
): Promise<Array<HookRunRow & { agentName?: string | null }>> {
  const rows = await pgDb
    .select({
      id: HookRunTable.id,
      eventId: HookRunTable.eventId,
      inboundEndpointId: HookRunTable.inboundEndpointId,
      agentId: HookRunTable.agentId,
      userId: HookRunTable.userId,
      status: HookRunTable.status,
      threadId: HookRunTable.threadId,
      error: HookRunTable.error,
      startedAt: HookRunTable.startedAt,
      finishedAt: HookRunTable.finishedAt,
      createdAt: HookRunTable.createdAt,
    })
    .from(HookRunTable)
    .where(eq(HookRunTable.userId, userId))
    .orderBy(desc(HookRunTable.createdAt))
    .limit(Math.min(limit, 200));
  return rows as Array<HookRunRow & { agentName?: string | null }>;
}

/** Queued runs oldest-first — the tick's inline execution backlog. */
export async function listQueuedHookRuns(limit = 3): Promise<HookRunRow[]> {
  const rows = await pgDb
    .select()
    .from(HookRunTable)
    .where(eq(HookRunTable.status, "queued"))
    .orderBy(HookRunTable.createdAt)
    .limit(Math.min(limit, 10));
  return rows as HookRunRow[];
}

/** Runs today for one endpoint — the daily-cap check. */
export async function countHookRunsToday(endpointId: string): Promise<number> {
  const [row] = await pgDb
    .select({ value: count() })
    .from(HookRunTable)
    .where(
      and(
        eq(HookRunTable.inboundEndpointId, endpointId),
        sql`${HookRunTable.createdAt} >= date_trunc('day', now())`,
        sql`${HookRunTable.status} <> 'skipped'`,
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * The endpoint's last executed (non-skipped) run — the cooldown check.
 * `excludeRunId` omits the CURRENT run: its own row was just created for the
 * event being processed, and counting it would block the first execution
 * forever (caught live by the e2e verification).
 */
export async function lastHookRunAt(
  endpointId: string,
  excludeRunId?: string,
): Promise<Date | null> {
  const [row] = await pgDb
    .select({ createdAt: HookRunTable.createdAt })
    .from(HookRunTable)
    .where(
      and(
        eq(HookRunTable.inboundEndpointId, endpointId),
        sql`${HookRunTable.status} <> 'skipped'`,
        excludeRunId ? sql`${HookRunTable.id} <> ${excludeRunId}` : sql`true`,
      ),
    )
    .orderBy(desc(HookRunTable.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export interface EndpointHookConfig {
  promptTemplate?: string;
  cooldownSeconds?: number;
  maxRunsPerDay?: number;
}

export function parseHookConfig(
  raw: unknown,
): Required<Omit<EndpointHookConfig, "promptTemplate">> &
  Pick<EndpointHookConfig, "promptTemplate"> {
  const config = (raw ?? {}) as EndpointHookConfig;
  return {
    promptTemplate:
      typeof config.promptTemplate === "string" && config.promptTemplate.trim()
        ? config.promptTemplate
        : undefined,
    cooldownSeconds:
      typeof config.cooldownSeconds === "number" && config.cooldownSeconds >= 0
        ? config.cooldownSeconds
        : 60,
    maxRunsPerDay:
      typeof config.maxRunsPerDay === "number" && config.maxRunsPerDay > 0
        ? Math.floor(config.maxRunsPerDay)
        : 20,
  };
}

/** Updates an endpoint's hook config (owner-scoped). */
export async function updateEndpointHookConfig(
  endpointId: string,
  userId: string,
  config: EndpointHookConfig,
): Promise<void> {
  await pgDb
    .update(InboundEndpointTable)
    .set({ hookConfig: config })
    .where(
      and(
        eq(InboundEndpointTable.id, endpointId),
        eq(InboundEndpointTable.userId, userId),
      ),
    );
}
