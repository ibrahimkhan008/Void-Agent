import { getSession } from "auth/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectWorkflowTable, WorkflowTable } from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { projectWorkflowAccessFilter } from "lib/projects/workflow-access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const attachSchema = z.object({ workflowId: z.string().uuid() }).strict();
const MAX_PROJECT_WORKFLOWS = 100;

async function authorize(projectId: string) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  return { userId: session.user.id, access };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const authorization = await authorize(projectId);
  if (authorization instanceof Response) return authorization;
  const accessFilter = projectWorkflowAccessFilter(
    authorization.userId,
    authorization.access.project.teamId,
  );

  const [workflows, availableWorkflows] = await Promise.all([
    pgDb
      .select({
        id: ProjectWorkflowTable.id,
        workflowId: ProjectWorkflowTable.workflowId,
        status: ProjectWorkflowTable.status,
        createdAt: ProjectWorkflowTable.createdAt,
        name: WorkflowTable.name,
        description: WorkflowTable.description,
        icon: WorkflowTable.icon,
      })
      .from(ProjectWorkflowTable)
      .innerJoin(
        WorkflowTable,
        eq(ProjectWorkflowTable.workflowId, WorkflowTable.id),
      )
      .where(and(eq(ProjectWorkflowTable.projectId, projectId), accessFilter))
      .orderBy(desc(ProjectWorkflowTable.createdAt))
      .limit(MAX_PROJECT_WORKFLOWS),
    mayEditProject(authorization.access.role)
      ? pgDb
          .select({
            id: WorkflowTable.id,
            name: WorkflowTable.name,
            description: WorkflowTable.description,
            icon: WorkflowTable.icon,
          })
          .from(WorkflowTable)
          .where(accessFilter)
          .orderBy(WorkflowTable.name)
          .limit(MAX_PROJECT_WORKFLOWS)
      : Promise.resolve([]),
  ]);

  return Response.json(
    { workflows, availableWorkflows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const authorization = await authorize(projectId);
  if (authorization instanceof Response) return authorization;
  if (!mayEditProject(authorization.access.role))
    return new Response("Forbidden", { status: 403 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const body = await readBoundedJsonRequest(request, 4096);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = attachSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid workflow selection" },
      { status: 400 },
    );

  const result = await pgDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`,
    );
    const [workflow] = await tx
      .select({ id: WorkflowTable.id })
      .from(WorkflowTable)
      .where(
        and(
          eq(WorkflowTable.id, parsed.data.workflowId),
          projectWorkflowAccessFilter(
            authorization.userId,
            authorization.access.project.teamId,
          ),
        ),
      )
      .limit(1);
    if (!workflow) return { status: "not-found" as const };

    const [existing] = await tx
      .select({
        id: ProjectWorkflowTable.id,
        workflowId: ProjectWorkflowTable.workflowId,
      })
      .from(ProjectWorkflowTable)
      .where(
        and(
          eq(ProjectWorkflowTable.projectId, projectId),
          eq(ProjectWorkflowTable.workflowId, workflow.id),
        ),
      )
      .limit(1);
    if (existing) return { status: "existing" as const, assignment: existing };

    const assignments = await tx
      .select({ id: ProjectWorkflowTable.id })
      .from(ProjectWorkflowTable)
      .where(eq(ProjectWorkflowTable.projectId, projectId))
      .limit(MAX_PROJECT_WORKFLOWS);
    if (assignments.length >= MAX_PROJECT_WORKFLOWS)
      return { status: "limit" as const };

    const [assignment] = await tx
      .insert(ProjectWorkflowTable)
      .values({
        projectId,
        workflowId: workflow.id,
        addedByUserId: authorization.userId,
      })
      .onConflictDoNothing({
        target: [
          ProjectWorkflowTable.projectId,
          ProjectWorkflowTable.workflowId,
        ],
      })
      .returning({
        id: ProjectWorkflowTable.id,
        workflowId: ProjectWorkflowTable.workflowId,
      });
    if (assignment) return { status: "created" as const, assignment };
    const [retry] = await tx
      .select({
        id: ProjectWorkflowTable.id,
        workflowId: ProjectWorkflowTable.workflowId,
      })
      .from(ProjectWorkflowTable)
      .where(
        and(
          eq(ProjectWorkflowTable.projectId, projectId),
          eq(ProjectWorkflowTable.workflowId, workflow.id),
        ),
      )
      .limit(1);
    return retry
      ? { status: "existing" as const, assignment: retry }
      : { status: "not-found" as const };
  });

  if (result.status === "not-found")
    return new Response("Workflow not found", { status: 404 });
  if (result.status === "limit")
    return Response.json(
      { error: "A project can have at most 100 assigned workflows" },
      { status: 409 },
    );
  return Response.json({ assignment: result.assignment }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const authorization = await authorize(projectId);
  if (authorization instanceof Response) return authorization;
  if (!mayEditProject(authorization.access.role))
    return new Response("Forbidden", { status: 403 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const workflowId = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("workflowId"));
  if (!workflowId.success)
    return Response.json(
      { error: "A valid workflowId is required" },
      { status: 400 },
    );

  const [deleted] = await pgDb
    .delete(ProjectWorkflowTable)
    .where(
      and(
        eq(ProjectWorkflowTable.projectId, projectId),
        eq(ProjectWorkflowTable.workflowId, workflowId.data),
      ),
    )
    .returning({ id: ProjectWorkflowTable.id });
  if (!deleted)
    return new Response("Workflow is not assigned to this project", {
      status: 404,
    });
  return Response.json({ ok: true });
}
