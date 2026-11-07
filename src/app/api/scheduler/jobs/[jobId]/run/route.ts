import { getSession } from "auth/server";
import {
  ManualScheduledRunConflictError,
  ManualScheduledRunIdempotencyConflictError,
  ManualScheduledRunUnavailableError,
  ScheduledJobReplayUnavailableError,
} from "lib/db/pg/repositories/scheduler-repository.pg";
import { schedulerRepository } from "lib/db/repository";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

/** Queue one owner-scoped manual run for the existing scheduler worker. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const requestKey = request.headers.get("Idempotency-Key");
  if (!requestKey || !IDEMPOTENCY_KEY_PATTERN.test(requestKey)) {
    return Response.json(
      { error: "A valid Idempotency-Key header is required." },
      { status: 400 },
    );
  }

  const { jobId } = await params;
  try {
    const result = await schedulerRepository.requestManualScheduledRun(
      jobId,
      session.user.id,
      requestKey,
    );
    return Response.json(
      { requestId: result.id, status: result.status },
      {
        status:
          result.created ||
          result.status === "pending" ||
          result.status === "processing"
            ? 202
            : 200,
      },
    );
  } catch (error) {
    if (error instanceof ManualScheduledRunUnavailableError) {
      return new Response("Schedule not found or cannot run manually", {
        status: 404,
      });
    }
    if (error instanceof ManualScheduledRunConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ManualScheduledRunIdempotencyConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ScheduledJobReplayUnavailableError) {
      return Response.json({ error: error.message }, { status: 410 });
    }
    console.error("[scheduler.manual-run] request failed", error);
    return Response.json(
      { error: "Could not queue the schedule run." },
      { status: 500 },
    );
  }
}
