import { timingSafeEqual } from "node:crypto";
import { inngest } from "@/lib/inngest/client";
import { webhookRepository } from "lib/db/repository";
import { HOOK_AGENT_RUN_EVENT, dispatchInboundHook } from "lib/hooks/dispatch";
import { runHookAgent } from "lib/hooks/executor";
import logger from "logger";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * POST /api/hooks/tick
 *
 * Secret-gated driver for Void Hooks, mirroring /api/scheduled-tasks/cron:
 * claims pending `inbound` outbox events, dispatches their hook runs, and
 * executes queued runs SYNCHRONOUSLY (up to a small batch). This is how the
 * feature is proven end-to-end without an Inngest registration, and how any
 * external scheduler (Vercel Cron, pg_cron) can drive it.
 *
 * The Inngest outbox tick dispatches the same runs via hookAgentRun; the
 * hook_run row + atomic claim make the two drivers safe to run concurrently
 * (one claim wins; the loser skips).
 *
 * Authorization: constant-time `X-Scheduled-Task-Auth: $SCHEDULED_TASK_SECRET`
 * (the same server-initiated-run trust boundary the scheduler uses).
 */
const CLAIM_LIMIT = 5;

export async function POST(request: Request) {
  const secret = process.env.SCHEDULED_TASK_SECRET;
  if (!secret) {
    logger.error("[hooks] tick route hit but SCHEDULED_TASK_SECRET unset");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const provided = request.headers.get("X-Scheduled-Task-Auth") ?? "";
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (
    providedBuf.length !== secretBuf.length ||
    !timingSafeEqual(providedBuf, secretBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await webhookRepository.claimPendingOutboxEvents(
    new Date(),
    CLAIM_LIMIT,
  );
  const inbound = events.filter(
    (event) =>
      event.kind === "inbound" &&
      typeof (event.payload as { agentId?: unknown })?.agentId === "string",
  );

  const dispatched: string[] = [];
  for (const event of inbound) {
    const dispatch = await dispatchInboundHook({
      eventId: event.id,
      payload: event.payload,
    });
    if (dispatch.runId) dispatched.push(dispatch.runId);
    // The hook_run row owns the outcome now — retire the outbox event so it
    // is not re-claimed by the next tick (the Inngest driver does this in
    // its own subscription path; this route is its own claimer).
    await webhookRepository.markOutboxEventDelivered(event.id);
  }

  // Inbound events without a bound agent can never dispatch a run; retire
  // them here too so they do not sit pending forever (the Inngest outbox
  // tick retires them on its own claim path; this route is its own claimer
  // and must not leak them).
  for (const event of events) {
    if (
      event.kind === "inbound" &&
      typeof (event.payload as { agentId?: unknown })?.agentId !== "string"
    ) {
      await webhookRepository.markOutboxEventDelivered(event.id);
    }
  }

  // Execute synchronously, bounded: each run is a full agent loop. The
  // backlog (queued runs from earlier ticks) is included so nothing starves
  // when Inngest is not driving the async path.
  const { listQueuedHookRuns } = await import(
    "@/lib/db/pg/repositories/hook-repository.pg"
  );
  const backlog = await listQueuedHookRuns(3);
  const toRun = [
    ...new Set([...backlog.map((r) => r.id), ...dispatched]),
  ].slice(0, 3);
  const results: Array<{
    runId: string;
    status: string;
    reason?: string;
  }> = [];
  for (const runId of toRun) {
    const result = await runHookAgent(runId);
    results.push({ runId, ...result });
  }

  // Anything not executed inline stays queued: re-enqueue it so the Inngest
  // path owns it too, not just the next tick's backlog scan. The budget
  // check is by runId — results also contains backlog runs, so a naive
  // `dispatched.slice(results.length)` could re-enqueue nothing (or the
  // wrong runs) whenever the backlog fills the inline budget.
  const executedRunIds = new Set(results.map((result) => result.runId));
  for (const runId of dispatched.filter((id) => !executedRunIds.has(id))) {
    await inngest
      .send({ name: HOOK_AGENT_RUN_EVENT, data: { runId } })
      .catch(() => {});
  }

  return NextResponse.json({
    claimed: events.length,
    inbound: inbound.length,
    dispatched,
    results,
  });
}
