import { getSession } from "auth/server";
import { and, eq, exists, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainEventTable,
} from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

const idSchema = z.string().uuid();
const reviewSchema = z
  .object({ status: z.enum(["accepted", "rejected"]) })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
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

  const { id: projectId, eventId } = await params;
  if (
    !idSchema.safeParse(projectId).success ||
    !idSchema.safeParse(eventId).success
  )
    return new Response("Not found", { status: 404 });
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  const rate = await checkApiRateLimit({
    kind: "project-brain-event-review",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJsonRequest(request, 4_096);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = reviewSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json({ error: "Invalid event status" }, { status: 400 });

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const collectionIds = access.project.collectionIds;
  if (!ownerIds.length || !collectionIds.length)
    return new Response("Not found", { status: 404 });

  const [visible] = await pgDb
    .select({ id: ProjectBrainEventTable.id })
    .from(ProjectBrainEventTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainEventTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainEventTable.id, eventId),
        eq(ProjectBrainEventTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainEventTable.runId,
          ProjectBrainEventTable.projectId,
          ProjectBrainEventTable.sourceItemId,
          ProjectBrainEventTable.chatSourceId,
        ),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);
  if (!visible) return new Response("Not found", { status: 404 });

  const [event] = await pgDb
    .update(ProjectBrainEventTable)
    .set({ status: parsed.data.status, reviewedAt: new Date() })
    .where(
      and(
        eq(ProjectBrainEventTable.id, eventId),
        eq(ProjectBrainEventTable.projectId, projectId),
        eq(ProjectBrainEventTable.status, "proposed"),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainEventTable.runId,
          ProjectBrainEventTable.projectId,
          ProjectBrainEventTable.sourceItemId,
          ProjectBrainEventTable.chatSourceId,
        ),
        exists(
          pgDb
            .select({ id: CollectionItemTable.id })
            .from(CollectionItemTable)
            .innerJoin(
              CollectionTable,
              eq(CollectionTable.id, CollectionItemTable.collectionId),
            )
            .where(
              and(
                eq(CollectionItemTable.id, ProjectBrainEventTable.sourceItemId),
                inArray(CollectionItemTable.collectionId, collectionIds),
                inArray(CollectionTable.userId, ownerIds),
                eq(CollectionItemTable.status, "ready"),
              ),
            ),
        ),
      ),
    )
    .returning({
      id: ProjectBrainEventTable.id,
      status: ProjectBrainEventTable.status,
    });
  if (!event)
    return Response.json(
      { error: "Event has already changed state" },
      { status: 409 },
    );
  return Response.json({ event }, { headers: { "Cache-Control": "no-store" } });
}
