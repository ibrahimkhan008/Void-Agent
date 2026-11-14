import "server-only";
import { and, eq } from "drizzle-orm";
import { pgDb } from "@/lib/db/pg/db.pg";
import { AgentTable, HookRunTable, InboundEndpointTable } from "@/lib/db/pg/schema.pg";
import {
  type HookRunRow,
  countHookRunsToday,
  createHookRun,
  finishHookRun,
  getHookRunById,
  lastHookRunAt,
  parseHookConfig,
} from "@/lib/db/pg/repositories/hook-repository.pg";
import { createNotifications } from "@/lib/notifications/create-notifications";
import { executeAgentRun } from "@/lib/scheduled-tasks/runner";
import logger from "logger";

/**
 * Void Hooks (master prompt §3.5) — the event-driven agent executor.
 *
 * The inbound pipeline already persists every received webhook/email/Slack
 * event as an outbox row (`inbound.received` with the endpoint's bound
 * agent). This module is the missing half: it turns a claimed event into an
 * ACTUAL agent run, with the master prompt's required guarantees:
 *
 * - Idempotency: one hook_run row per event (UNIQUE event_id) — a re-claimed
 *   event can never double-run, no matter how many tick drivers race.
 * - Loop prevention: per-endpoint cooldown + daily cap + enabled check, each
 *   recorded as a `skipped` run so the user can see why an event did not
 *   execute. Outbound webhook deliveries never re-enter the inbound pipeline
 *   (separate tables, opposite direction); a user who deliberately points a
 *   subscription at their own endpoint is bounded by the cooldown and cap.
 * - Timeouts: the agent run reuses the scheduled-task runner's loopback chat
 *   execution, which enforces the run clock and records stream outcomes.
 * - Audit: every run keeps status, thread id, error and timings in hook_run.
 */

export const HOOK_AGENT_RUN_EVENT = "void/hooks.agent-run";

/** Bounds on one rendered prompt so a huge payload cannot blow the context. */
const MAX_PROMPT_CHARS = 24_000;

interface InboundOutboxPayload {
  endpointId?: string;
  userId?: string;
  agentId?: string;
  deliveryId?: string;
  normalized?: {
    kind?: string;
    text?: string;
    from?: string;
    subject?: string;
    [key: string]: unknown;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Called by the outbox tick for every claimed `inbound` event. Idempotent:
 * creates the queued hook_run (UNIQUE event_id) and enqueues the Inngest run.
 * Returns whether a NEW run was dispatched (a re-claim of an already
 * dispatched event returns false and does nothing).
 */
export async function dispatchInboundHook(input: {
  eventId: string;
  payload: Record<string, unknown>;
  /** Enqueues the async run (Inngest). The secret-gated tick path runs inline. */
  enqueue?: (data: { runId: string }) => Promise<unknown>;
}): Promise<{ dispatched: boolean; runId: string | null }> {
  const payload = (input.payload ?? {}) as InboundOutboxPayload;
  const agentId = isNonEmptyString(payload.agentId) ? payload.agentId : null;
  const userId = isNonEmptyString(payload.userId) ? payload.userId : null;
  const endpointId = isNonEmptyString(payload.endpointId)
    ? payload.endpointId
    : null;
  if (!agentId || !userId || !endpointId) {
    return { dispatched: false, runId: null };
  }

  const { created, runId } = await createHookRun({
    eventId: input.eventId,
    inboundEndpointId: endpointId,
    agentId,
    userId,
  });
  if (!created || !runId) {
    return { dispatched: false, runId };
  }
  if (input.enqueue) {
    try {
      await input.enqueue({ runId });
    } catch (error) {
      logger.error(
        `[hooks] failed to enqueue run ${runId}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { dispatched: true, runId };
}

/**
 * Renders the agent prompt for an event. A user template may reference
 * {{kind}}, {{from}}, {{subject}}, {{text}} and {{json}}; unknown tokens are
 * left as-is, and the whole thing is size-capped.
 */
export function renderHookPrompt(
  template: string | undefined,
  payload: InboundOutboxPayload,
): string {
  const normalized = payload.normalized ?? {};
  const kind = isNonEmptyString(normalized.kind) ? normalized.kind : "webhook";
  const text = isNonEmptyString(normalized.text) ? normalized.text : "";
  const from = isNonEmptyString(normalized.from) ? normalized.from : "";
  const subject = isNonEmptyString(normalized.subject) ? normalized.subject : "";
  const json = JSON.stringify(normalized, null, 2);

  const header = `You were triggered by a Void Hook (an inbound ${kind} event). Handle the event end to end: do what it asks, verify your work, and summarize the outcome with concrete values.`;

  let body: string;
  if (template) {
    body = template
      .replaceAll("{{kind}}", kind)
      .replaceAll("{{from}}", from)
      .replaceAll("{{subject}}", subject)
      .replaceAll("{{text}}", text)
      .replaceAll("{{json}}", json);
  } else {
    const contextLines = [
      from && `From: ${from}`,
      subject && `Subject: ${subject}`,
      text && `Content:\n${text}`,
      !text && json !== "{}" && `Payload:\n${json}`,
    ].filter(Boolean);
    body = contextLines.join("\n\n") || json;
  }

  const prompt = `${header}\n\n${body}`;
  return prompt.length > MAX_PROMPT_CHARS
    ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n\n[…payload truncated]`
    : prompt;
}

/**
 * The gate + execution for one queued hook run. Safe to call concurrently
 * from any driver: the run row transitions queued → running atomically via a
 * conditional UPDATE, so only one driver wins.
 */
export async function runHookAgent(runId: string): Promise<{
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
}> {
  const run = (await getHookRunById(runId)) as HookRunRow | null;
  if (!run) return { status: "skipped", reason: "run not found" };
  if (run.status !== "queued") {
    return { status: "skipped", reason: `already ${run.status}` };
  }

  // Atomic claim: queued → running. The loser sees status !== queued on the
  // next read and skips — two tick drivers cannot both execute one run.
  // Atomic claim: queued → running. The conditional UPDATE means two tick
  // drivers can never both execute one run; the loser's UPDATE matches zero
  // rows and it skips.
  const claimed = await pgDb
    .update(HookRunTable)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(HookRunTable.id, runId), eq(HookRunTable.status, "queued")))
    .returning({ id: HookRunTable.id });
  if (!claimed.length) {
    return { status: "skipped", reason: "claimed by another driver" };
  }

  try {
    const [endpoint] = await pgDb
      .select()
      .from(InboundEndpointTable)
      .where(eq(InboundEndpointTable.id, run.inboundEndpointId))
      .limit(1);
    if (!endpoint?.enabled) {
      const reason = "endpoint disabled";
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }

    const config = parseHookConfig(endpoint.hookConfig);

    // Loop prevention 1: cooldown.
    const lastAt = await lastHookRunAt(run.inboundEndpointId);
    if (lastAt) {
      const elapsed = (Date.now() - new Date(lastAt).getTime()) / 1000;
      if (elapsed < config.cooldownSeconds) {
        const reason = `cooldown active (${Math.round(elapsed)}s < ${config.cooldownSeconds}s)`;
        await finishHookRun(runId, { status: "skipped", error: reason });
        return { status: "skipped", reason };
      }
    }

    // Loop prevention 2: daily cap.
    const runsToday = await countHookRunsToday(run.inboundEndpointId);
    if (runsToday >= config.maxRunsPerDay) {
      const reason = `daily cap reached (${runsToday}/${config.maxRunsPerDay})`;
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }

    const [agent] = await pgDb
      .select()
      .from(AgentTable)
      .where(eq(AgentTable.id, run.agentId))
      .limit(1);
    if (!agent) {
      const reason = "agent not found";
      await finishHookRun(runId, { status: "failed", error: reason });
      await notifyFailure(run.userId, run.agentId, reason, null);
      return { status: "failed", reason };
    }

    // Re-read the event payload for the prompt render.
    const payload = await loadEventPayload(run.eventId);
    const prompt = renderHookPrompt(config.promptTemplate, payload ?? {});

    const result = await executeAgentRun(
      {
        id: run.id,
        userId: run.userId,
        agentId: run.agentId,
        inputPrompt: prompt,
        lastChatThreadId: null,
      },
      {
        name: agent.name,
        description: agent.description ?? null,
        icon: agent.icon,
        model: agent.model ?? null,
        organizationId: agent.organizationId ?? null,
      },
    );

    if (result.success) {
      await finishHookRun(runId, {
        status: "succeeded",
        threadId: result.threadId,
      });
      return { status: "succeeded" };
    }

    const reason = result.error ?? "agent run failed";
    await finishHookRun(runId, {
      status: "failed",
      error: reason,
      threadId: result.threadId,
    });
    await notifyFailure(run.userId, run.agentId, reason, result.threadId);
    return { status: "failed", reason };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`[hooks] run ${runId} failed`, reason);
    await finishHookRun(runId, { status: "failed", error: reason }).catch(
      () => {},
    );
    await notifyFailure(run.userId, run.agentId, reason, null).catch(() => {});
    return { status: "failed", reason };
  }
}

/**
 * The outbox event row carries the normalized payload; the hook_run only
 * stores the id. Load it back for the prompt render.
 */
async function loadEventPayload(
  eventId: string,
): Promise<InboundOutboxPayload | null> {
  const { WebhookEventOutboxTable } = await import("../db/pg/schema.pg");
  const [row] = await pgDb
    .select({ payload: WebhookEventOutboxTable.payload })
    .from(WebhookEventOutboxTable)
    .where(eq(WebhookEventOutboxTable.id, eventId))
    .limit(1);
  return (row?.payload as InboundOutboxPayload) ?? null;
}

async function notifyFailure(
  userId: string,
  agentId: string,
  reason: string,
  threadId: string | null,
): Promise<void> {
  try {
    await createNotifications({
      userIds: [userId],
      type: "hook_run_failure",
      title: "A Void Hook run failed",
      body: reason,
      threadId: threadId,
      agentId: agentId,
      url: threadId ? `/chat/${threadId}` : "/webhooks",
      push: { kind: "error", tag: `hook-run-${agentId}` },
    });
  } catch (error) {
    logger.error(
      "[hooks] failure notification failed",
      error instanceof Error ? error.message : error,
    );
  }
}


