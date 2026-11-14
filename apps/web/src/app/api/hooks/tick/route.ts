import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inngest } from "@/lib/inngest/client";
import { dispatchInboundHook, runHookAgent } from "lib/hooks/executor";
import { webhookRepository } from "lib/db/repository";
import logger from "logger";

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
  }

  // Execute synchronously, bounded: each run is a full agent loop.
  const results: Array<{
    runId: string;
    status: string;
    reason?: string;
  }> = [];
  for (const runId of dispatched.slice(0, 3)) {
    const result = await runHookAgent(runId);
    results.push({ runId, ...result });
  }

  // Anything not executed inline stays queued for the Inngest path.
  for (const runId of dispatched.slice(results.length)) {
    await inngest
      .send({ name: "void/hooks.agent-run", data: { runId } })
      .catch(() => {});
  }

  return NextResponse.json({
    claimed: events.length,
    inbound: inbound.length,
    dispatched,
    results,
  });
}
