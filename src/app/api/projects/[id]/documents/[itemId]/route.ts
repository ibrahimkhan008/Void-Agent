import { getSession } from "auth/server";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectDocumentTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

/** Removes the project link while preserving the source in its collection. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const { id: projectId, itemId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  if (!access.project.collectionIds.length)
    return new Response("Not found", { status: 404 });

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const [source] = await pgDb
    .select({
      id: ProjectDocumentTable.collectionItemId,
      collectionId: CollectionItemTable.collectionId,
      collectionOwnerId: CollectionTable.userId,
    })
    .from(ProjectDocumentTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectDocumentTable.collectionItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectDocumentTable.projectId, projectId),
        eq(ProjectDocumentTable.collectionItemId, itemId),
        inArray(CollectionItemTable.collectionId, access.project.collectionIds),
        inArray(CollectionTable.userId, ownerIds),
      ),
    )
    .limit(1);
  if (!source) return new Response("Not found", { status: 404 });

  // Project access and collection ownership can change while the source row
  // is being resolved. Recheck the current editor scope before removing the
  // link. This operation intentionally never deletes the collection item or
  // its original storage object; those may be shared with other projects.
  const currentAccess = await getProjectAccess(projectId, session.user.id);
  if (!currentAccess) return new Response("Not found", { status: 404 });
  if (!mayEditProject(currentAccess.role))
    return new Response("Forbidden", { status: 403 });
  if (!currentAccess.project.collectionIds.includes(source.collectionId))
    return new Response("Not found", { status: 404 });
  const currentOwnerIds =
    await getProjectCollectionSourceOwnerIds(currentAccess);
  if (!currentOwnerIds.includes(source.collectionOwnerId))
    return new Response("Not found", { status: 404 });

  await pgDb
    .delete(ProjectDocumentTable)
    .where(
      and(
        eq(ProjectDocumentTable.projectId, projectId),
        eq(ProjectDocumentTable.collectionItemId, itemId),
      ),
    );
  return new Response(null, { status: 204 });
}
