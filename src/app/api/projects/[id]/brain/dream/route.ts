import { getSession } from "auth/server";
import { and, desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainDreamRunTable } from "lib/db/pg/schema.pg";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { enqueueProjectBrainDream } from "lib/projects/brain-dream";
import {
  canRetryProjectBrainDream,
  makeProjectBrainDreamIdempotencyKey,
} from "lib/projects/brain-dream-state";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid project" }, { status: 400 });
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const runs = await pgDb
    .select({
      id: ProjectBrainDreamRunTable.id,
      idempotencyKey: ProjectBrainDreamRunTable.idempotencyKey,
      reason: ProjectBrainDreamRunTable.reason,
      status: ProjectBrainDreamRunTable.status,
      stage: ProjectBrainDreamRunTable.stage,
      metrics: ProjectBrainDreamRunTable.metrics,
      warnings: ProjectBrainDreamRunTable.warnings,
      errorMessage: ProjectBrainDreamRunTable.errorMessage,
      createdAt: ProjectBrainDreamRunTable.createdAt,
      updatedAt: ProjectBrainDreamRunTable.updatedAt,
      finishedAt: ProjectBrainDreamRunTable.finishedAt,
    })
    .from(ProjectBrainDreamRunTable)
    .where(eq(ProjectBrainDreamRunTable.projectId, id))
    .orderBy(desc(ProjectBrainDreamRunTable.createdAt))
    .limit(5);
  return Response.json(
    {
      runs: runs.map(({ idempotencyKey, ...run }) => ({
        ...run,
        canRetry: canRetryProjectBrainDream(run.status, idempotencyKey),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid project" }, { status: 400 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  const bodyBytes = await readBoundedRequestBody(request, 2_048);
  if (!bodyBytes)
    return Response.json(
      { error: "Request body is too large" },
      { status: 413 },
    );
  const bodyText = new TextDecoder().decode(bodyBytes);
  let retryRunId: string | undefined;
  if (bodyText) {
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = z
      .object({ retryRunId: z.string().uuid() })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid retry request" }, { status: 400 });
    retryRunId = parsed.data.retryRunId;
  }
  const rate = await checkApiRateLimit({
    kind: "project-brain-dream",
    id: session.user.id,
    limit: 2,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many brain cycles. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  let idempotencyKey = makeProjectBrainDreamIdempotencyKey(
    "manual",
    new Date(),
  );
  if (retryRunId) {
    const [sourceRun] = await pgDb
      .select({
        id: ProjectBrainDreamRunTable.id,
        status: ProjectBrainDreamRunTable.status,
        idempotencyKey: ProjectBrainDreamRunTable.idempotencyKey,
      })
      .from(ProjectBrainDreamRunTable)
      .where(
        and(
          eq(ProjectBrainDreamRunTable.id, retryRunId),
          eq(ProjectBrainDreamRunTable.projectId, id),
        ),
      )
      .limit(1);
    if (
      !sourceRun ||
      !canRetryProjectBrainDream(sourceRun.status, sourceRun.idempotencyKey)
    )
      return Response.json(
        { error: "This brain cycle cannot be retried" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    idempotencyKey = `retry:${sourceRun.id}`;
  }
  const result = await enqueueProjectBrainDream({
    projectId: id,
    userId: session.user.id,
    reason: "manual",
    idempotencyKey,
  });
  if (!result.id)
    return Response.json(
      { error: "Could not queue the brain cycle" },
      { status: 503 },
    );
  return Response.json(
    { runId: result.id, deduplicated: !result.created },
    {
      status: result.created ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
