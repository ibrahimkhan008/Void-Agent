import "server-only";

import { getSession } from "auth/server";
import { schedulerRepository } from "lib/db/repository";
import { getScheduledRunFailureDiagnostic } from "lib/scheduler/run-diagnostics";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const errorResponse = (message: string, status: number) =>
  new Response(message, { status, headers: NO_STORE_HEADERS });

const JOB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) return errorResponse("Invalid jobId", 400);

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 20 : Number(rawLimit);
  if (
    !Number.isSafeInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > 100
  ) {
    return errorResponse("limit must be an integer from 1 to 100", 400);
  }

  try {
    const job = await schedulerRepository.getScheduledJob(
      jobId,
      session.user.id,
    );
    if (!job) return errorResponse("Schedule not found", 404);
    const runs = await schedulerRepository.listScheduledRuns(
      jobId,
      session.user.id,
      parsedLimit,
    );
    // Run output and provider error text are not needed by the history view and
    // can contain prompt or integration data. Expose only lifecycle metadata.
    return Response.json(
      {
        runs: runs.map(({ id, startedAt, completedAt, status, error }) => ({
          id,
          startedAt,
          completedAt,
          status,
          ...(status === "failed"
            ? { failureDiagnostic: getScheduledRunFailureDiagnostic(error) }
            : {}),
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return errorResponse("Could not load schedule history", 500);
  }
}
