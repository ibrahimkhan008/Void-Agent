import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { z } from "zod";

import { schedulerRepository } from "lib/db/repository";
import { computeNextRun } from "lib/scheduler/cron-parser";
import {
  normalizeScheduleUpdateInput,
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

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "paused", "disabled"]).optional(),
    schedule: z
      .discriminatedUnion("scheduleType", [
        z.object({
          scheduleType: z.literal("once"),
          prompt: z.string().trim().min(1).max(8000),
          runAt: z.string().datetime({ offset: true }),
          timezone: z.string().trim().min(1).max(64).optional(),
        }),
        z.object({
          scheduleType: z.literal("recurring"),
          prompt: z.string().trim().min(1).max(8000),
          cron: z.string().trim().min(1).max(120),
          timezone: z.string().trim().min(1).max(64),
        }),
      ])
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Provide at least one field to update.",
  });

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

const pathParamsSchema = z.object({
  jobId: z.string().uuid("jobId must be a UUID"),
});

const parseJobId = (raw: string) => pathParamsSchema.shape.jobId.safeParse(raw);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  try {
    const job = await schedulerRepository.getScheduledJob(
      idCheck.data,
      session.user.id,
    );
    if (!job) return new Response("Schedule not found", { status: 404 });
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(errorFromZod(parsed.error), { status: 400 });
  }

  let current;
  try {
    current = await schedulerRepository.getScheduledJob(
      idCheck.data,
      session.user.id,
    );
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
  if (!current) return new Response("Schedule not found", { status: 404 });

  let schedulePatch = {};
  if (parsed.data.schedule) {
    try {
      schedulePatch = normalizeScheduleUpdateInput(
        parsed.data.schedule,
        current,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid schedule update.";
      return new Response(message, { status: 400 });
    }
  }

  // Re-enabling a recurring schedule should resume at its next future cron
  // occurrence. Keeping an old due timestamp would immediately replay a slot
  // that elapsed while paused. One-time jobs deliberately retain their
  // original instant so a still-pending timer is not silently moved.
  if (
    parsed.data.status === "active" &&
    current.status !== "active" &&
    !parsed.data.schedule &&
    current.payload?.scheduleType !== "once" &&
    typeof current.payload?.runAt !== "string"
  ) {
    try {
      schedulePatch = {
        nextRunAt: computeNextRun(
          current.cron,
          new Date(),
          current.timezone ?? "UTC",
        ),
      };
    } catch {
      return new Response("Schedule timing is invalid and cannot be resumed", {
        status: 400,
      });
    }
  }

  try {
    const job = await schedulerRepository.updateScheduledJob(
      idCheck.data,
      session.user.id,
      {
        ...schedulePatch,
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
      },
    );
    if (!job) return new Response("Schedule not found", { status: 404 });
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  try {
    const removed = await schedulerRepository.deleteScheduledJob(
      idCheck.data,
      session.user.id,
    );
    if (!removed) return new Response("Schedule not found", { status: 404 });
    return Response.json({ status: "ok" });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
