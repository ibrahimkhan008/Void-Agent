import { getSession } from "auth/server";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainTodoTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

const idSchema = z.string().uuid();
const transitionSchema = z
  .object({
    status: z.enum(["accepted", "rejected", "completed"]),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; todoId: string }> },
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
  const { id: projectId, todoId } = await params;
  if (
    !idSchema.safeParse(projectId).success ||
    !idSchema.safeParse(todoId).success
  ) {
    return new Response("Not found", { status: 404 });
  }
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-todo-review",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid task status" }, { status: 400 });

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!access.project.collectionIds.length || !ownerIds.length) {
    return new Response("Not found", { status: 404 });
  }
  const [visible] = await pgDb
    .select({ id: ProjectBrainTodoTable.id })
    .from(ProjectBrainTodoTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainTodoTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainTodoTable.id, todoId),
        eq(ProjectBrainTodoTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainTodoTable.runId,
          ProjectBrainTodoTable.projectId,
          ProjectBrainTodoTable.sourceItemId,
        ),
        inArray(CollectionItemTable.collectionId, access.project.collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);
  if (!visible) return new Response("Not found", { status: 404 });

  const allowedFrom =
    parsed.data.status === "completed" ? "accepted" : "proposed";
  const [todo] = await pgDb
    .update(ProjectBrainTodoTable)
    .set({ status: parsed.data.status, reviewedAt: new Date() })
    .where(
      and(
        eq(ProjectBrainTodoTable.id, todoId),
        eq(ProjectBrainTodoTable.projectId, projectId),
        eq(ProjectBrainTodoTable.status, allowedFrom),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainTodoTable.runId,
          ProjectBrainTodoTable.projectId,
          ProjectBrainTodoTable.sourceItemId,
        ),
      ),
    )
    .returning({
      id: ProjectBrainTodoTable.id,
      status: ProjectBrainTodoTable.status,
    });
  if (!todo)
    return Response.json(
      { error: "Task has already changed state" },
      { status: 409 },
    );
  return Response.json({ todo }, { headers: { "Cache-Control": "no-store" } });
}
