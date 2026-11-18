import { timingSafeEqual } from "node:crypto";
import { runWebhookOutboxTick } from "@/lib/inngest/functions/webhook-outbox";
import { runDailyDigest } from "@/lib/notifications/digest-cron";
import { runSentinelTick } from "@/lib/sentinel/probe";
import { processSentinelIncidents } from "@/lib/sentinel/repair";
import logger from "logger";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Inngest-free background job driver (the "own scheduler" path). Every job
 * here also ships as an Inngest cron function; when Inngest is not
 * configured, the VPS systemd timers hit these endpoints instead — same
 * trust boundary as /api/hooks/tick and /api/scheduled-tasks/cron
 * (constant-time X-Scheduled-Task-Auth: $SCHEDULED_TASK_SECRET).
 *
 * Jobs:
 *   outbox-tick  — claims inbound outbox events (hooks dispatch + agent
 *                  runs) and delivers webhook subscriptions. Minute cadence.
 *   email-digest — the daily generic notification summary (09:00 cadence,
 *                  SMTP-gated; no-op when SMTP is unset).
 *   sentinel     — probes every enabled published-site monitor, opens
 *                  incidents on failures, and runs the mode-gated repair
 *                  pipeline (suggest / repair-approval / autonomous).
 */

const JOB_NAMES = new Set(["outbox-tick", "email-digest", "sentinel"]);

function authorize(request: Request): Response | null {
  const secret = process.env.SCHEDULED_TASK_SECRET;
  if (!secret) {
    logger.error("[background-jobs] hit but SCHEDULED_TASK_SECRET unset");
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
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ job: string }> },
) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const params = await context.params;
  const job = params.job ?? "";
  if (!JOB_NAMES.has(job)) {
    return NextResponse.json(
      {
        error: `Unknown job: ${job || "(none)"}. Known: ${[...JOB_NAMES].join(", ")}`,
      },
      { status: 404 },
    );
  }

  try {
    if (job === "outbox-tick") {
      const result = await runWebhookOutboxTick();
      return NextResponse.json({ job, ...result });
    }
    if (job === "sentinel") {
      const probe = await runSentinelTick();
      const repair = await processSentinelIncidents();
      return NextResponse.json({
        job,
        ...probe,
        repair,
      });
    }
    const result = await runDailyDigest();
    return NextResponse.json({ job, ...result });
  } catch (error) {
    logger.error(
      `[background-jobs] ${job} failed`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        job,
        error: error instanceof Error ? error.message : "Job failed",
      },
      { status: 500 },
    );
  }
}
