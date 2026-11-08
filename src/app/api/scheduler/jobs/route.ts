import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { z } from "zod";

import {
  ScheduledJobIdempotencyConflictError,
  ScheduledJobReplayUnavailableError,
} from "lib/db/pg/repositories/scheduler-repository.pg";
import { agentRepository, schedulerRepository } from "lib/db/repository";
import {
  createScheduledJobForUser,
  publicScheduledJob,
} from "lib/scheduler/jobs";

export const dynamic = "force-dynamic";

function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try {
    return (
      Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin
    );
  } catch {
    return false;
  }
}

const createBodySchema = z.object({
  scheduleType: z.enum(["once", "recurring"]),
  title: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(8000),
  cron: z.string().trim().min(1).max(120).optional(),
  runAt: z.string().trim().min(1).optional(),
  delay: z
    .object({
      amount: z.number().int().positive().max(10_000),
      unit: z.enum(["minute", "minutes", "hour", "hours", "day", "days"]),
    })
    .optional(),
  naturalLanguage: z.string().trim().min(1).max(500).optional(),
  agentId: z.string().uuid().optional(),
  threadId: z.string().trim().min(1).max(128).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const jobs = await schedulerRepository.listScheduledJobs(session.user.id);
    return Response.json({ jobs: jobs.map(publicScheduledJob) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(errorFromZod(parsed.error), { status: 400 });
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (
    idempotencyKey !== null &&
    !/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)
  ) {
    return new Response("Invalid idempotency key", { status: 400 });
  }

  if (parsed.data.agentId) {
    const agent = await agentRepository.selectAgentById(
      parsed.data.agentId,
      session.user.id,
    );
    // A public/read-only agent is not sufficient: scheduled runs execute with
    // the caller's authority and must target an agent owned by that caller.
    if (!agent || agent.userId !== session.user.id) {
      return new Response("Agent not found", { status: 404 });
    }
  }

  try {
    const job = await createScheduledJobForUser(
      session.user.id,
      {
        ...parsed.data,
        createdFrom: "api",
      },
      new Date(),
      idempotencyKey ?? undefined,
    );
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    if (err instanceof ScheduledJobIdempotencyConflictError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ScheduledJobReplayUnavailableError) {
      return Response.json({ error: err.message }, { status: 410 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to create schedule.";
    return new Response(message, { status: 400 });
  }
}
