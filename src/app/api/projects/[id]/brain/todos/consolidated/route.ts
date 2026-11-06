import { getSession } from "auth/server";
import { and, eq, exists, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainRunTable,
  ProjectBrainTodoTable,
} from "lib/db/pg/schema.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { hasSameProjectBrainTaskIdentity } from "lib/projects/consolidate-brain-todos";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({ todoIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.todoIds).size !== value.todoIds.length) {
      context.addIssue({
        code: "custom",
        path: ["todoIds"],
        message: "Task IDs must be unique",
      });
    }
  });

export async function PATCH(
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
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  const rate = await checkApiRateLimit({
    kind: "project-brain-todo-consolidation",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many task updates. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );

  const body = await readBoundedJson(request, 8_192);
  if (!body.ok)
    return Response.json(
      {
        error: body.tooLarge
          ? "Request body is too large"
          : "Invalid JSON body",
      },
      { status: body.tooLarge ? 413 : 400 },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json({ error: "Invalid task group" }, { status: 400 });

  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length)
    return new Response("Not found", { status: 404 });

  const rows = await pgDb
    .select({
      id: ProjectBrainTodoTable.id,
      title: ProjectBrainTodoTable.title,
      details: ProjectBrainTodoTable.details,
      sourceItemId: ProjectBrainTodoTable.sourceItemId,
    })
    .from(ProjectBrainTodoTable)
    .innerJoin(
      ProjectBrainRunTable,
      eq(ProjectBrainRunTable.id, ProjectBrainTodoTable.runId),
    )
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
        eq(ProjectBrainTodoTable.projectId, projectId),
        eq(ProjectBrainTodoTable.status, "accepted"),
        inArray(ProjectBrainTodoTable.id, parsed.data.todoIds),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainTodoTable.runId,
          ProjectBrainTodoTable.projectId,
          ProjectBrainTodoTable.sourceItemId,
        ),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    );

  if (rows.length !== parsed.data.todoIds.length)
    return new Response("Not found", { status: 404 });
  if (
    !hasSameProjectBrainTaskIdentity(
      rows.map(({ title, details }) => ({ title, details })),
    )
  ) {
    return Response.json(
      { error: "Tasks do not belong to one exact matching group" },
      { status: 409 },
    );
  }

  try {
    const completedTodoIds = await pgDb.transaction(async (tx) => {
      const visibleSource = tx
        .select({ id: CollectionItemTable.id })
        .from(CollectionItemTable)
        .innerJoin(
          CollectionTable,
          eq(CollectionTable.id, CollectionItemTable.collectionId),
        )
        .where(
          and(
            eq(CollectionItemTable.id, ProjectBrainTodoTable.sourceItemId),
            inArray(CollectionItemTable.collectionId, collectionIds),
            inArray(CollectionTable.userId, ownerIds),
            eq(CollectionItemTable.status, "ready"),
          ),
        );
      const updated = await tx
        .update(ProjectBrainTodoTable)
        .set({ status: "completed", reviewedAt: new Date() })
        .where(
          and(
            eq(ProjectBrainTodoTable.projectId, projectId),
            inArray(ProjectBrainTodoTable.id, parsed.data.todoIds),
            eq(ProjectBrainTodoTable.status, "accepted"),
            projectBrainRunIsActiveSourceRevision(
              ProjectBrainTodoTable.runId,
              ProjectBrainTodoTable.projectId,
              ProjectBrainTodoTable.sourceItemId,
            ),
            exists(visibleSource),
          ),
        )
        .returning({ id: ProjectBrainTodoTable.id });
      if (updated.length !== parsed.data.todoIds.length)
        throw new Error("STALE_TASK_GROUP");
      return updated.map((todo) => todo.id);
    });
    return Response.json(
      { completedTodoIds },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_TASK_GROUP")
      return Response.json(
        { error: "The task group changed. Refresh and try again." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    console.error("[project-brain] consolidated task completion failed", error);
    return Response.json(
      { error: "Could not complete the project task" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
