import {
  MANUAL_RUN_IDEMPOTENCY_KEY_PATTERN,
  ManualTaskRunConflictError,
  ManualTaskRunIdempotencyConflictError,
  ManualTaskRunReplayUnavailableError,
  ManualTaskRunUnavailableError,
  claimManualTaskRun,
  completeManualTaskRun,
  failManualTaskRun,
  getManualTaskRunRequest,
  queueManualTaskRun,
} from "@/lib/scheduled-tasks/manual-run-requests";
import { runScheduledTaskNow } from "@/lib/scheduled-tasks/runner";
import { withAuth } from "auth/route-guard";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

// The run holds this route open for the full loopback /api/chat stream.
export const maxDuration = 300;

/**
 * POST /api/scheduled-tasks/[id]/run
 * Runs the scheduled task once, synchronously, WITHOUT Inngest — a manual
 * "Run now" that tests the whole agent-run route on demand and isolates
 * Inngest-connectivity issues from run-logic issues.
 */
export const POST = withAuth(
  async (request, session, { params }: { params: Promise<{ id: string }> }) => {
    try {
      if (!hasSameOrigin(request)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { id } = await params;

      const requestKey = request.headers.get("Idempotency-Key");
      if (!requestKey || !MANUAL_RUN_IDEMPOTENCY_KEY_PATTERN.test(requestKey)) {
        return NextResponse.json(
          { error: "A valid Idempotency-Key header is required." },
          { status: 400 },
        );
      }

      const queued = await queueManualTaskRun(id, session.user.id, requestKey);
      if (queued.status === "completed" && queued.outcome) {
        return NextResponse.json(queued.outcome);
      }
      if (queued.status === "failed") {
        return NextResponse.json(
          { error: queued.error ?? "The previous manual run failed." },
          { status: 500 },
        );
      }

      const claimToken = crypto.randomUUID();
      const claimed = await claimManualTaskRun(queued.id, claimToken);
      if (!claimed) {
        const current = await getManualTaskRunRequest(
          queued.id,
          session.user.id,
        );
        if (current?.status === "completed" && current.outcome) {
          return NextResponse.json(current.outcome);
        }
        if (current?.status === "failed") {
          return NextResponse.json(
            { error: current.error ?? "The previous manual run failed." },
            { status: 500 },
          );
        }
        return NextResponse.json(
          { requestId: queued.id, status: "processing" },
          { status: 202 },
        );
      }

      try {
        const outcome = await runScheduledTaskNow(id);
        await completeManualTaskRun(queued.id, claimToken, outcome);
        return NextResponse.json(outcome);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Scheduled run failed.";
        await failManualTaskRun(queued.id, claimToken, message);
        console.error("Error running scheduled task:", error);
        return NextResponse.json(
          { error: "Failed to run scheduled task" },
          { status: 500 },
        );
      }
    } catch (error) {
      if (error instanceof ManualTaskRunUnavailableError) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (error instanceof ManualTaskRunReplayUnavailableError) {
        return NextResponse.json({ error: error.message }, { status: 410 });
      }
      if (
        error instanceof ManualTaskRunConflictError ||
        error instanceof ManualTaskRunIdempotencyConflictError
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("Error running scheduled task:", error);
      return NextResponse.json(
        { error: "Failed to run scheduled task" },
        { status: 500 },
      );
    }
  },
);
