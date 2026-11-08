import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainAliasTable,
  ProjectBrainFactTable,
  ProjectBrainPageMergeTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";

type Db = Pick<typeof pgDb, "select" | "update" | "insert">;

export type ProjectBrainMergeResult =
  | { status: "merged"; survivorPageId: string; mergedPageId: string }
  | { status: "already-merged"; survivorPageId: string; mergedPageId: string }
  | {
      status:
        | "not-found"
        | "source-unavailable"
        | "type-mismatch"
        | "already-archived";
    };

/**
 * Merge two same-type page identities inside the caller's DB transaction.
 * Source facts and aliases are retained and repointed; the loser stays as an
 * archived redirect, with an immutable actor/endpoints record for history.
 */
export async function mergeProjectBrainPages(
  db: Db,
  input: {
    projectId: string;
    survivorPageId: string;
    mergedPageId: string;
    actorUserId: string;
    collectionIds: string[];
    ownerIds: string[];
  },
): Promise<ProjectBrainMergeResult> {
  const { projectId, survivorPageId, mergedPageId } = input;
  if (survivorPageId === mergedPageId) return { status: "already-archived" };

  const pages = await db
    .select()
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, projectId),
        inArray(ProjectBrainPageTable.id, [survivorPageId, mergedPageId]),
      ),
    )
    .orderBy(asc(ProjectBrainPageTable.id))
    .for("update");
  if (pages.length !== 2) return { status: "not-found" };
  const survivor = pages.find((page) => page.id === survivorPageId);
  const merged = pages.find((page) => page.id === mergedPageId);
  if (!survivor || !merged) return { status: "not-found" };
  if (merged.mergedIntoPageId === survivorPageId && merged.archivedAt) {
    return { status: "already-merged", survivorPageId, mergedPageId };
  }
  if (
    survivor.archivedAt ||
    survivor.mergedIntoPageId ||
    merged.archivedAt ||
    merged.mergedIntoPageId
  ) {
    return { status: "already-archived" };
  }
  if (survivor.entityType !== merged.entityType)
    return { status: "type-mismatch" };

  if (!input.collectionIds.length || !input.ownerIds.length) {
    return { status: "source-unavailable" };
  }
  const identityFacts = await db
    .select({
      pageId: ProjectBrainFactTable.subjectPageId,
      entityType: ProjectBrainFactTable.object,
    })
    .from(ProjectBrainFactTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainFactTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
        ),
        inArray(ProjectBrainFactTable.subjectPageId, [
          survivorPageId,
          mergedPageId,
        ]),
        eq(ProjectBrainFactTable.predicate, "entity type"),
        eq(ProjectBrainFactTable.reviewStatus, "accepted"),
        inArray(CollectionItemTable.collectionId, input.collectionIds),
        inArray(CollectionTable.userId, input.ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    );
  const hasVisibleIdentity = (pageId: string, entityType: string) =>
    identityFacts.some(
      (fact) => fact.pageId === pageId && fact.entityType === entityType,
    );
  if (
    !hasVisibleIdentity(survivorPageId, survivor.entityType) ||
    !hasVisibleIdentity(mergedPageId, merged.entityType)
  ) {
    return { status: "source-unavailable" };
  }

  const now = new Date();
  await db.insert(ProjectBrainPageMergeTable).values({
    projectId,
    survivorPageId,
    mergedPageId,
    actorUserId: input.actorUserId,
    entityType: survivor.entityType,
    survivorTitle: survivor.title,
    mergedTitle: merged.title,
  });
  await db
    .update(ProjectBrainFactTable)
    .set({ subjectPageId: survivorPageId })
    .where(
      and(
        eq(ProjectBrainFactTable.projectId, projectId),
        eq(ProjectBrainFactTable.subjectPageId, mergedPageId),
      ),
    );
  await db
    .update(ProjectBrainFactTable)
    .set({ objectPageId: survivorPageId })
    .where(
      and(
        eq(ProjectBrainFactTable.projectId, projectId),
        eq(ProjectBrainFactTable.objectPageId, mergedPageId),
      ),
    );
  await db
    .update(ProjectBrainAliasTable)
    .set({ pageId: survivorPageId })
    .where(
      and(
        eq(ProjectBrainAliasTable.projectId, projectId),
        eq(ProjectBrainAliasTable.pageId, mergedPageId),
      ),
    );
  await db
    .update(ProjectBrainPageTable)
    .set({ mergedIntoPageId: survivorPageId, archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(ProjectBrainPageTable.id, mergedPageId),
        eq(ProjectBrainPageTable.projectId, projectId),
        isNull(ProjectBrainPageTable.archivedAt),
      ),
    );
  await db
    .update(ProjectBrainPageTable)
    .set({ updatedAt: now })
    .where(
      and(
        eq(ProjectBrainPageTable.id, survivorPageId),
        eq(ProjectBrainPageTable.projectId, projectId),
        isNull(ProjectBrainPageTable.archivedAt),
      ),
    );

  return { status: "merged", survivorPageId, mergedPageId };
}
