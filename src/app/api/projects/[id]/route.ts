import { getSession } from "auth/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  canAttachCollectionToProject,
  getCollectionAccess,
} from "lib/collections/access";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectTable } from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  mayEditProject,
  mayManageProject,
} from "lib/projects/access";
import { z } from "zod";

const patchProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    goal: z.string().trim().max(4000).nullable().optional(),
    systemPrompt: z.string().trim().max(12000).nullable().optional(),
    collectionIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  return Response.json({ ...access.project, role: access.role });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid project update" }, { status: 400 });
  }
  if (parsed.data.collectionIds) {
    const collections = await Promise.all(
      parsed.data.collectionIds.map((collectionId) =>
        getCollectionAccess(collectionId, session.user.id),
      ),
    );
    if (
      collections.some(
        (collection) =>
          !canAttachCollectionToProject(
            collection,
            session.user.id,
            access.project.teamId,
          ),
      )
    ) {
      return new Response("Invalid knowledge collection selection", {
        status: 403,
      });
    }
  }

  const projectScope = access.project.teamId
    ? and(
        eq(ProjectTable.id, id),
        eq(ProjectTable.teamId, access.project.teamId),
      )
    : and(
        eq(ProjectTable.id, id),
        eq(ProjectTable.userId, session.user.id),
        isNull(ProjectTable.teamId),
      );
  const [project] = await pgDb
    .update(ProjectTable)
    .set({
      ...parsed.data,
      ...(parsed.data.collectionIds
        ? { collectionIds: [...new Set(parsed.data.collectionIds)] }
        : {}),
      updatedAt: new Date(),
    })
    .where(projectScope)
    .returning();
  if (!project) return new Response("Not found", { status: 404 });
  return Response.json({ project, role: access.role });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayManageProject(access.role))
    return new Response("Forbidden", { status: 403 });
  await pgDb.delete(ProjectTable).where(eq(ProjectTable.id, id));
  return new Response(null, { status: 204 });
}
