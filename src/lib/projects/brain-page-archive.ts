import "server-only";

import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
} from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";

const STALE_AFTER_DAYS = 30;
const MAX_PAGE_RESULTS = 100;

type PageScope = {
  projectId: string;
  collectionIds: string[];
  ownerIds: string[];
};

function visibleHistoricalPageFact(pageId: SQLWrapper, scope: PageScope) {
  return exists(
    pgDb
      .select({ id: ProjectBrainFactTable.id })
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
          eq(ProjectBrainFactTable.projectId, scope.projectId),
          eq(ProjectBrainFactTable.subjectPageId, pageId),
          inArray(CollectionItemTable.collectionId, scope.collectionIds),
          inArray(CollectionTable.userId, scope.ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      ),
  );
}

function currentIdentityPageFact(pageId: SQLWrapper, scope: PageScope) {
  return exists(
    pgDb
      .select({ id: ProjectBrainFactTable.id })
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
          eq(ProjectBrainFactTable.projectId, scope.projectId),
          eq(ProjectBrainFactTable.subjectPageId, pageId),
          eq(ProjectBrainFactTable.predicate, "entity type"),
          eq(ProjectBrainFactTable.object, ProjectBrainPageTable.entityType),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ),
          inArray(CollectionItemTable.collectionId, scope.collectionIds),
          inArray(CollectionTable.userId, scope.ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      ),
  );
}

function hasPageScope(scope: PageScope) {
  return scope.collectionIds.length > 0 && scope.ownerIds.length > 0;
}

export async function listStaleProjectBrainPages(scope: PageScope) {
  if (!hasPageScope(scope)) return [];
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  return pgDb
    .select({
      id: ProjectBrainPageTable.id,
      title: ProjectBrainPageTable.title,
      entityType: ProjectBrainPageTable.entityType,
      updatedAt: ProjectBrainPageTable.updatedAt,
    })
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, scope.projectId),
        isNull(ProjectBrainPageTable.archivedAt),
        isNull(ProjectBrainPageTable.mergedIntoPageId),
        lt(ProjectBrainPageTable.updatedAt, cutoff),
        visibleHistoricalPageFact(ProjectBrainPageTable.id, scope),
        notExists(currentIdentityPageFact(ProjectBrainPageTable.id, scope)),
      ),
    )
    .orderBy(asc(ProjectBrainPageTable.updatedAt))
    .limit(MAX_PAGE_RESULTS);
}

export async function listRestorableProjectBrainPages(scope: PageScope) {
  if (!hasPageScope(scope)) return [];
  return pgDb
    .select({
      id: ProjectBrainPageTable.id,
      title: ProjectBrainPageTable.title,
      entityType: ProjectBrainPageTable.entityType,
      archivedAt: ProjectBrainPageTable.archivedAt,
    })
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, scope.projectId),
        isNotNull(ProjectBrainPageTable.archivedAt),
        isNull(ProjectBrainPageTable.mergedIntoPageId),
        currentIdentityPageFact(ProjectBrainPageTable.id, scope),
      ),
    )
    .orderBy(asc(ProjectBrainPageTable.archivedAt))
    .limit(MAX_PAGE_RESULTS);
}

export async function archiveStaleProjectBrainPage(
  scope: PageScope & { pageId: string },
) {
  if (!hasPageScope(scope)) return false;
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const [page] = await pgDb
    .update(ProjectBrainPageTable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(ProjectBrainPageTable.id, scope.pageId),
        eq(ProjectBrainPageTable.projectId, scope.projectId),
        isNull(ProjectBrainPageTable.archivedAt),
        isNull(ProjectBrainPageTable.mergedIntoPageId),
        lt(ProjectBrainPageTable.updatedAt, cutoff),
        visibleHistoricalPageFact(ProjectBrainPageTable.id, scope),
        notExists(currentIdentityPageFact(ProjectBrainPageTable.id, scope)),
      ),
    )
    .returning({ id: ProjectBrainPageTable.id });
  return Boolean(page);
}

export async function restoreProjectBrainPage(
  scope: PageScope & { pageId: string },
) {
  if (!hasPageScope(scope)) return false;
  const [page] = await pgDb
    .update(ProjectBrainPageTable)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(ProjectBrainPageTable.id, scope.pageId),
        eq(ProjectBrainPageTable.projectId, scope.projectId),
        isNotNull(ProjectBrainPageTable.archivedAt),
        isNull(ProjectBrainPageTable.mergedIntoPageId),
        currentIdentityPageFact(ProjectBrainPageTable.id, scope),
      ),
    )
    .returning({ id: ProjectBrainPageTable.id });
  return Boolean(page);
}
