import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ProjectMemberTable,
  TeamMemberTable,
  TeamTable,
  UserTable,
} from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["viewer", "editor"]).default("viewer"),
});

async function authorize(
  requestedId: string,
): Promise<
  | Response
  | { access: NonNullable<Awaited<ReturnType<typeof getProjectAccess>>> }
> {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const access = await getProjectAccess(requestedId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!access.project.teamId) {
    return Response.json(
      { error: "Personal projects do not support collaborators." },
      { status: 409 },
    );
  }
  return { access };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized instanceof Response) return authorized;

  const [members, teamMembers, team] = await Promise.all([
    pgDb
      .select({
        userId: ProjectMemberTable.userId,
        role: ProjectMemberTable.role,
        createdAt: ProjectMemberTable.createdAt,
        name: UserTable.name,
        email: UserTable.email,
        image: UserTable.image,
      })
      .from(ProjectMemberTable)
      .innerJoin(UserTable, eq(ProjectMemberTable.userId, UserTable.id))
      .where(eq(ProjectMemberTable.projectId, id)),
    mayEditProject(authorized.access.role)
      ? pgDb
          .select({
            userId: TeamMemberTable.userId,
            name: UserTable.name,
            email: UserTable.email,
            image: UserTable.image,
          })
          .from(TeamMemberTable)
          .innerJoin(UserTable, eq(TeamMemberTable.userId, UserTable.id))
          .where(eq(TeamMemberTable.teamId, authorized.access.project.teamId!))
      : Promise.resolve([]),
    pgDb
      .select({ ownerId: TeamTable.ownerId })
      .from(TeamTable)
      .where(eq(TeamTable.id, authorized.access.project.teamId!)),
  ]);
  const existingMemberIds = new Set([
    authorized.access.project.userId,
    team[0]?.ownerId,
    ...members.map((member) => member.userId),
  ]);
  const eligibleMembers = teamMembers.filter(
    (member) => !existingMemberIds.has(member.userId),
  );
  return Response.json(
    {
      accessMode: authorized.access.project.accessMode,
      members,
      eligibleMembers,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized instanceof Response) return authorized;
  const access = authorized.access;
  if (!mayEditProject(access.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const body = await readBoundedJsonRequest(request, 4_096);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = addMemberSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "Invalid project member" }, { status: 400 });
  }
  if (parsed.data.userId === access.project.userId) {
    return Response.json(
      { error: "The project creator cannot be re-roled." },
      { status: 409 },
    );
  }

  const teamId = access.project.teamId;
  if (!teamId) return new Response("Conflict", { status: 409 });
  const [[team], [membership]] = await Promise.all([
    pgDb
      .select({ ownerId: TeamTable.ownerId })
      .from(TeamTable)
      .where(eq(TeamTable.id, teamId)),
    pgDb
      .select({ userId: TeamMemberTable.userId })
      .from(TeamMemberTable)
      .where(
        and(
          eq(TeamMemberTable.teamId, teamId),
          eq(TeamMemberTable.userId, parsed.data.userId),
        ),
      ),
  ]);
  if (team?.ownerId === parsed.data.userId) {
    return Response.json(
      { error: "The team owner already has project access." },
      { status: 409 },
    );
  }
  if (!membership) {
    return Response.json(
      { error: "Collaborators must belong to this team." },
      { status: 422 },
    );
  }

  const [member] = await pgDb
    .insert(ProjectMemberTable)
    .values({
      projectId: id,
      userId: parsed.data.userId,
      role: parsed.data.role,
    })
    .onConflictDoUpdate({
      target: [ProjectMemberTable.projectId, ProjectMemberTable.userId],
      set: { role: parsed.data.role },
    })
    .returning({
      userId: ProjectMemberTable.userId,
      role: ProjectMemberTable.role,
    });
  return Response.json({ member }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized instanceof Response) return authorized;
  const access = authorized.access;
  if (!mayEditProject(access.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  let requestBody: Uint8Array | null;
  try {
    requestBody = await readBoundedRequestBody(request, 0);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (requestBody === null || requestBody.byteLength > 0) {
    return Response.json(
      { error: "DELETE request body is not supported" },
      { status: 413 },
    );
  }
  const parsed = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("userId"));
  if (!parsed.success)
    return Response.json(
      { error: "A valid userId is required" },
      { status: 400 },
    );
  if (parsed.data === access.project.userId) {
    return Response.json(
      { error: "The project owner cannot be removed." },
      { status: 409 },
    );
  }

  const teamId = access.project.teamId;
  if (!teamId) return new Response("Conflict", { status: 409 });
  const [team] = await pgDb
    .select({ ownerId: TeamTable.ownerId })
    .from(TeamTable)
    .where(eq(TeamTable.id, teamId));
  if (team?.ownerId === parsed.data) {
    return Response.json(
      { error: "The team owner already has project access." },
      { status: 409 },
    );
  }

  const [deleted] = await pgDb
    .delete(ProjectMemberTable)
    .where(
      and(
        eq(ProjectMemberTable.projectId, id),
        eq(ProjectMemberTable.userId, parsed.data),
      ),
    )
    .returning({ userId: ProjectMemberTable.userId });
  if (!deleted) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}
