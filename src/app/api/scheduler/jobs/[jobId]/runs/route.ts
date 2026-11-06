import "server-only";

import { getSession } from "auth/server";
import { schedulerRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) return new Response("Invalid jobId", { status: 400 });

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return new Response("limit must be an integer from 1 to 100", { status: 400 });
  }

  try {
    const job = await schedulerRepository.getScheduledJob(jobId, session.user.id);
    if (!job) return new Response("Schedule not found", { status: 404 });
    const runs = await schedulerRepository.listScheduledRuns(jobId, session.user.id, parsedLimit);
    // Run output and provider error text are not needed by the history view and
    // can contain prompt or integration data. Expose only lifecycle metadata.
    return Response.json({ runs: runs.map(({ id, startedAt, completedAt, status }) => ({ id, startedAt, completedAt, status })) });
  } catch {
    return new Response("Could not load schedule history", { status: 500 });
  }
}
