import { getSession } from "auth/server";
import {
  canAttachCollectionToProject,
  getCollectionAccess,
} from "lib/collections/access";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectTable } from "lib/db/pg/schema.pg";
import { canCreateTeamProject, listProjectsForUser } from "lib/projects/access";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  goal: z.string().trim().max(4000).optional(),
  systemPrompt: z.string().trim().max(12000).optional(),
  collectionIds: z.array(z.string().uuid()).max(20).optional(),
  teamId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const projects = await listProjectsForUser(session.user.id);
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid project", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { teamId, collectionIds = [], ...fields } = parsed.data;
  if (teamId && !(await canCreateTeamProject(teamId, session.user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  if (collectionIds.length) {
    // At creation time only collections owned by the creator are accepted.
    // Shared-team collection access is wired separately before team RAG use.
    const collections = await Promise.all(
      collectionIds.map((id) => getCollectionAccess(id, session.user.id)),
    );
    if (
      collections.some(
        (collection) =>
          !canAttachCollectionToProject(
            collection,
            session.user.id,
            teamId ?? null,
          ),
      )
    ) {
      return new Response("Invalid knowledge collection selection", {
        status: 403,
      });
    }
  }

  const [project] = await pgDb
    .insert(ProjectTable)
    .values({
      ...fields,
      userId: session.user.id,
      teamId: teamId ?? null,
      collectionIds: [...new Set(collectionIds)],
    })
    .returning();
  return Response.json({ project, role: "owner" }, { status: 201 });
}
