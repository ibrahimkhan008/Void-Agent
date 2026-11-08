import { getSession } from "auth/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainEventTable,
  ProjectBrainRunTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const collectionIds = access.project.collectionIds;
  if (!ownerIds.length || !collectionIds.length) {
    return Response.json(
      { events: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const visibleEvents = await pgDb
    .select({
      id: ProjectBrainEventTable.id,
      summary: ProjectBrainEventTable.summary,
      detail: ProjectBrainEventTable.detail,
      evidence: ProjectBrainEventTable.evidence,
      eventDate: ProjectBrainEventTable.eventDate,
      status: ProjectBrainEventTable.status,
      createdAt: ProjectBrainEventTable.createdAt,
      sourceItemId: ProjectBrainEventTable.sourceItemId,
      sourceVersionId: ProjectBrainRunTable.sourceVersionId,
      filename: CollectionItemTable.filename,
      collectionId: CollectionItemTable.collectionId,
    })
    .from(ProjectBrainEventTable)
    .innerJoin(
      ProjectBrainRunTable,
      eq(ProjectBrainRunTable.id, ProjectBrainEventTable.runId),
    )
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
        ...(mayEditProject(access.role)
          ? []
          : [eq(ProjectBrainEventTable.status, "accepted")]),
      ),
    )
    .orderBy(
      desc(ProjectBrainEventTable.eventDate),
      desc(ProjectBrainEventTable.createdAt),
    )
    .limit(100);

  return Response.json(
    { events: visibleEvents },
    { headers: { "Cache-Control": "no-store" } },
  );
}
