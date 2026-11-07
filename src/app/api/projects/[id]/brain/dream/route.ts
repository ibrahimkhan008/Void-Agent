import { getSession } from "auth/server";
import { desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainDreamRunTable } from "lib/db/pg/schema.pg";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { enqueueProjectBrainDream } from "lib/projects/brain-dream";
import { makeProjectBrainDreamIdempotencyKey } from "lib/projects/brain-dream-state";
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
  return Response.json({ runs }, { headers: { "Cache-Control": "no-store" } });
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
  const result = await enqueueProjectBrainDream({
    projectId: id,
    userId: session.user.id,
    reason: "manual",
    idempotencyKey: makeProjectBrainDreamIdempotencyKey("manual", new Date()),
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
