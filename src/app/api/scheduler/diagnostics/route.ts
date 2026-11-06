import "server-only";

import { getSession } from "auth/server";
import { getBaseUrl } from "lib/const";
import { schedulerRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  try {
    const now = new Date();
    const jobs = await schedulerRepository.listScheduledJobs(session.user.id);
    return Response.json({
      now: now.toISOString(),
      // Report presence only. Never return scheduler credentials or URLs.
      environment: {
        cronSecret: Boolean(process.env.CRON_SECRET),
        internalSecret: Boolean(process.env.SCHEDULER_INTERNAL_SECRET || process.env.CRON_SECRET),
        baseUrl: Boolean(getBaseUrl()),
      },
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        timezone: job.timezone ?? "UTC",
        nextRunAt: job.nextRunAt,
        dueNow: job.status === "active" && job.nextRunAt.getTime() <= now.getTime(),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("Could not build scheduler diagnostics", { status: 500 });
  }
}
