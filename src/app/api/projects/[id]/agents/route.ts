import { getSession } from "auth/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { AgentTable, ProjectAgentTable } from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { agentAccessFilter } from "lib/projects/agent-access";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const attachSchema = z.object({ agentId: z.string().uuid() }).strict();

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

  const [agents, availableAgents] = await Promise.all([
    pgDb
      .select({
        id: ProjectAgentTable.id,
        agentId: ProjectAgentTable.agentId,
        createdAt: ProjectAgentTable.createdAt,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
      })
      .from(ProjectAgentTable)
      .innerJoin(AgentTable, eq(ProjectAgentTable.agentId, AgentTable.id))
      .where(
        and(
          eq(ProjectAgentTable.projectId, projectId),
          agentAccessFilter(
            authorization.userId,
            authorization.access.project.teamId,
          ),
        ),
      )
      .orderBy(desc(ProjectAgentTable.createdAt))
      .limit(100),
    mayEditProject(authorization.access.role)
      ? pgDb
          .select({
            id: AgentTable.id,
            name: AgentTable.name,
            description: AgentTable.description,
            icon: AgentTable.icon,
          })
          .from(AgentTable)
          .where(
            agentAccessFilter(
              authorization.userId,
              authorization.access.project.teamId,
            ),
          )
          .orderBy(AgentTable.name)
          .limit(100)
      : Promise.resolve([]),
  ]);
  return Response.json(
    { agents, availableAgents },
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
    return Response.json({ error: "Invalid agent selection" }, { status: 400 });

  const result = await pgDb.transaction(async (tx) => {
    // Serialize additions for this project so the 100-assignment bound cannot
    // be exceeded by concurrent requests. Check duplicates before the cap so
    // a retry remains idempotent even when the project is full.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`,
    );
    const [agent] = await tx
      .select({ id: AgentTable.id })
      .from(AgentTable)
      .where(
        and(
          eq(AgentTable.id, parsed.data.agentId),
          agentAccessFilter(
            authorization.userId,
            authorization.access.project.teamId,
          ),
        ),
      )
      .limit(1);
    if (!agent) return { status: "not-found" as const };

    const [existing] = await tx
      .select({ id: ProjectAgentTable.id, agentId: ProjectAgentTable.agentId })
      .from(ProjectAgentTable)
      .where(
        and(
          eq(ProjectAgentTable.projectId, projectId),
          eq(ProjectAgentTable.agentId, agent.id),
        ),
      )
      .limit(1);
    if (existing) return { status: "existing" as const, assignment: existing };

    const assigned = await tx
      .select({ id: ProjectAgentTable.id })
      .from(ProjectAgentTable)
      .where(eq(ProjectAgentTable.projectId, projectId))
      .limit(100);
    if (assigned.length >= 100) return { status: "limit" as const };

    const [assignment] = await tx
      .insert(ProjectAgentTable)
      .values({
        projectId,
        agentId: agent.id,
        addedByUserId: authorization.userId,
      })
      .onConflictDoNothing({
        target: [ProjectAgentTable.projectId, ProjectAgentTable.agentId],
      })
      .returning({
        id: ProjectAgentTable.id,
        agentId: ProjectAgentTable.agentId,
      });
    if (assignment) return { status: "created" as const, assignment };
    const [retry] = await tx
      .select({ id: ProjectAgentTable.id, agentId: ProjectAgentTable.agentId })
      .from(ProjectAgentTable)
      .where(
        and(
          eq(ProjectAgentTable.projectId, projectId),
          eq(ProjectAgentTable.agentId, agent.id),
        ),
      )
      .limit(1);
    return retry
      ? { status: "existing" as const, assignment: retry }
      : { status: "not-found" as const };
  });

  if (result.status === "not-found")
    return new Response("Agent not found", { status: 404 });
  if (result.status === "limit")
    return Response.json(
      { error: "A project can have at most 100 assigned agents" },
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
  const agentId = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("agentId"));
  if (!agentId.success)
    return Response.json(
      { error: "A valid agentId is required" },
      { status: 400 },
    );

  const [deleted] = await pgDb
    .delete(ProjectAgentTable)
    .where(
      and(
        eq(ProjectAgentTable.projectId, projectId),
        eq(ProjectAgentTable.agentId, agentId.data),
      ),
    )
    .returning({ id: ProjectAgentTable.id });
  if (!deleted)
    return new Response("Agent is not assigned to this project", {
      status: 404,
    });
  return Response.json({ ok: true });
}
