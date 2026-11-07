import "server-only";

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
} from "lib/projects/access";

/** Resolves a project-linked DOCX through current project/collection ownership. */
export async function projectDocumentEditSource(
  projectId: string,
  itemId: string,
  userId: string,
) {
  const access = await getProjectAccess(projectId, userId);
  if (!access || access.project.collectionIds.length === 0) return null;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (ownerIds.length === 0) return null;
  const [source] = await pgDb
    .select({
      projectDocumentId: ProjectDocumentTable.id,
      itemId: ProjectDocumentTable.collectionItemId,
      filename: CollectionItemTable.filename,
      mediaType: CollectionItemTable.mediaType,
      storageKey: CollectionItemTable.storageKey,
      status: CollectionItemTable.status,
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
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);
  if (
    !source?.storageKey ||
    !source.filename ||
    !source.filename.toLowerCase().endsWith(".docx")
  )
    return null;
  return { ...source, access, ownerIds };
}
