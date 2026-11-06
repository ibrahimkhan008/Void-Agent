import { getSession } from "auth/server";
import { and, desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainStatusSnapshotTable } from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import {
  generateProjectBrainStatus,
  loadProjectBrainStatusContext,
} from "lib/projects/project-brain-status";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ProjectAccess = NonNullable<Awaited<ReturnType<typeof getProjectAccess>>>;
type ProjectAccessResult =
  | { ok: true; access: ProjectAccess }
  | { ok: false; response: Response };

async function getCurrentAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccessResult> {
  const access = await getProjectAccess(projectId, userId);
  if (!access)
    return { ok: false, response: new Response("Not found", { status: 404 }) };
  return { ok: true, access };
}

async function getCurrentContext(access: ProjectAccess) {
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const context = await loadProjectBrainStatusContext({
    project: access.project,
    collectionIds: access.project.collectionIds,
    ownerIds,
  });
  return { context };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  try {
    const current = await getCurrentAccess(projectId, session.user.id);
    if (!current.ok) return current.response;
    const { context } = await getCurrentContext(current.access);
    if (!context)
      return Response.json(
        { snapshot: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    const [snapshot] = await pgDb
      .select({
        id: ProjectBrainStatusSnapshotTable.id,
        health: ProjectBrainStatusSnapshotTable.health,
        progressPct: ProjectBrainStatusSnapshotTable.progressPct,
        summary: ProjectBrainStatusSnapshotTable.summary,
        blockers: ProjectBrainStatusSnapshotTable.blockers,
        createdAt: ProjectBrainStatusSnapshotTable.createdAt,
      })
      .from(ProjectBrainStatusSnapshotTable)
      .where(andProjectFingerprint(projectId, context.inputFingerprint))
      .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
      .limit(1);
    return Response.json(
      { snapshot: snapshot ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[project-brain] status read failed", error);
    return Response.json(
      { error: "Could not load project status" },
      { status: 500 },
    );
  }
}

function andProjectFingerprint(projectId: string, fingerprint: string) {
  return and(
    eq(ProjectBrainStatusSnapshotTable.projectId, projectId),
    eq(ProjectBrainStatusSnapshotTable.inputFingerprint, fingerprint),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { id: projectId } = await params;
  const current = await getCurrentAccess(projectId, session.user.id);
  if (!current.ok) return current.response;
  if (!mayEditProject(current.access.role))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-status",
    id: session.user.id,
    limit: 2,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many project status refreshes. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  const { context } = await getCurrentContext(current.access);
  if (!context)
    return Response.json(
      {
        error:
          "No current accepted project knowledge is available to summarize",
      },
      { status: 422 },
    );

  try {
    const status = await generateProjectBrainStatus(context.input);
    const [snapshot] = await pgDb
      .insert(ProjectBrainStatusSnapshotTable)
      .values({
        projectId,
        generatedByUserId: session.user.id,
        inputFingerprint: context.inputFingerprint,
        sourceRefs: context.sourceRefs,
        health: status.health,
        progressPct: status.progressPct ?? null,
        summary: status.summary,
        blockers: status.blockers,
      })
      .returning({
        id: ProjectBrainStatusSnapshotTable.id,
        health: ProjectBrainStatusSnapshotTable.health,
        progressPct: ProjectBrainStatusSnapshotTable.progressPct,
        summary: ProjectBrainStatusSnapshotTable.summary,
        blockers: ProjectBrainStatusSnapshotTable.blockers,
        createdAt: ProjectBrainStatusSnapshotTable.createdAt,
      });
    if (!snapshot) throw new Error("Status snapshot was not persisted");
    return Response.json(
      { snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[project-brain] status generation failed", error);
    return Response.json(
      { error: "Could not generate a project status summary" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
