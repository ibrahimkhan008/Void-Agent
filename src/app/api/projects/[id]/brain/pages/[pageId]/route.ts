import { getSession } from "auth/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainFactTable,
  ProjectBrainPageMergeTable,
  ProjectBrainPageTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { z } from "zod";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

/** Read one accepted identity page and its claims from currently visible source revisions. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id: projectId, pageId } = await params;
  if (
    !uuidSchema.safeParse(projectId).success ||
    !uuidSchema.safeParse(pageId).success
  ) {
    return Response.json(
      { error: "Invalid project brain page" },
      { status: 400 },
    );
  }

  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length) {
    return Response.json(
      { detail: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [page] = await pgDb
      .select({
        id: ProjectBrainPageTable.id,
        title: ProjectBrainPageTable.title,
        entityType: ProjectBrainPageTable.entityType,
        normalizedTitle: ProjectBrainPageTable.normalizedTitle,
        salience: ProjectBrainPageTable.salience,
        updatedAt: ProjectBrainPageTable.updatedAt,
      })
      .from(ProjectBrainPageTable)
      .innerJoin(
        ProjectBrainFactTable,
        eq(ProjectBrainFactTable.subjectPageId, ProjectBrainPageTable.id),
      )
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
          eq(ProjectBrainPageTable.id, pageId),
          eq(ProjectBrainPageTable.projectId, projectId),
          isNull(ProjectBrainPageTable.archivedAt),
          eq(ProjectBrainFactTable.projectId, projectId),
          eq(ProjectBrainFactTable.predicate, "entity type"),
          eq(ProjectBrainFactTable.object, ProjectBrainPageTable.entityType),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
          ),
          eq(CollectionItemTable.status, "ready"),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
        ),
      )
      .limit(1);

    if (!page) {
      return Response.json(
        { detail: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const facts = await pgDb
      .select({
        id: ProjectBrainFactTable.id,
        subjectPageId: ProjectBrainFactTable.subjectPageId,
        objectPageId: ProjectBrainFactTable.objectPageId,
        subject: ProjectBrainFactTable.subject,
        predicate: ProjectBrainFactTable.predicate,
        object: ProjectBrainFactTable.object,
        evidence: ProjectBrainFactTable.evidence,
        confidence: ProjectBrainFactTable.confidence,
        reviewStatus: ProjectBrainFactTable.reviewStatus,
        sourceItemId: ProjectBrainFactTable.sourceItemId,
        sourceVersionId: ProjectBrainFactTable.sourceVersionId,
        sourceVersionCreatedAt: ProjectBrainSourceVersionTable.createdAt,
        sourceSnapshotAvailable: sql<boolean>`${ProjectBrainSourceVersionTable.contentSnapshot} IS NOT NULL`,
        filename: CollectionItemTable.filename,
        sourceUrl: CollectionItemTable.sourceUrl,
      })
      .from(ProjectBrainFactTable)
      .innerJoin(
        ProjectBrainSourceVersionTable,
        and(
          eq(
            ProjectBrainSourceVersionTable.id,
            ProjectBrainFactTable.sourceVersionId,
          ),
          eq(
            ProjectBrainSourceVersionTable.projectId,
            ProjectBrainFactTable.projectId,
          ),
          eq(
            ProjectBrainSourceVersionTable.sourceItemId,
            ProjectBrainFactTable.sourceItemId,
          ),
        ),
      )
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
          or(
            eq(ProjectBrainFactTable.subjectPageId, pageId),
            eq(ProjectBrainFactTable.objectPageId, pageId),
          ),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
          ),
          eq(CollectionItemTable.status, "ready"),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
        ),
      )
      .orderBy(
        desc(ProjectBrainFactTable.createdAt),
        desc(ProjectBrainFactTable.id),
      )
      .limit(100);

    // Merge titles are only revealed while the original accepted identity
    // claim is still in a current, attached source visible to this project.
    // The merge ledger alone is not enough: its source may since have been
    // detached or revised, so re-apply the live source/owner scope here.
    const mergedFromRows = await pgDb
      .select({
        title: ProjectBrainPageMergeTable.mergedTitle,
        mergedAt: ProjectBrainPageMergeTable.createdAt,
      })
      .from(ProjectBrainPageMergeTable)
      .innerJoin(
        ProjectBrainFactTable,
        and(
          eq(
            ProjectBrainFactTable.projectId,
            ProjectBrainPageMergeTable.projectId,
          ),
          eq(
            ProjectBrainFactTable.subject,
            ProjectBrainPageMergeTable.mergedTitle,
          ),
          eq(ProjectBrainFactTable.predicate, "entity type"),
          eq(
            ProjectBrainFactTable.object,
            ProjectBrainPageMergeTable.entityType,
          ),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
          ),
        ),
      )
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
          eq(ProjectBrainPageMergeTable.projectId, projectId),
          eq(ProjectBrainPageMergeTable.survivorPageId, page.id),
          eq(
            ProjectBrainFactTable.subject,
            ProjectBrainPageMergeTable.mergedTitle,
          ),
          eq(ProjectBrainFactTable.predicate, "entity type"),
          eq(
            ProjectBrainFactTable.object,
            ProjectBrainPageMergeTable.entityType,
          ),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
          ),
          eq(CollectionItemTable.status, "ready"),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
        ),
      )
      .orderBy(desc(ProjectBrainPageMergeTable.createdAt))
      .limit(50);

    const aliases = [
      ...new Set(
        facts
          .filter(
            (fact) =>
              fact.reviewStatus === "accepted" &&
              fact.subjectPageId === page.id &&
              ["alias", "also known as"].includes(
                fact.predicate.trim().toLocaleLowerCase(),
              ),
          )
          .map((fact) => fact.object.trim())
          .filter(
            (alias) =>
              alias &&
              alias.toLocaleLowerCase() !== page.title.toLocaleLowerCase(),
          ),
      ),
    ];

    // The primary project brain models typed relationships as source-backed
    // facts with page IDs. Split those facts by direction for entity detail,
    // matching the reference links/backlinks behavior without adding a second
    // relationship table or exposing stale-source claims.
    const relationshipPredicates = new Set([
      "entity type",
      "summary",
      "alias",
      "also known as",
    ]);
    const links = facts
      .filter(
        (fact) =>
          fact.reviewStatus === "accepted" &&
          fact.subjectPageId === page.id &&
          fact.objectPageId &&
          fact.objectPageId !== page.id &&
          !relationshipPredicates.has(
            fact.predicate.trim().toLocaleLowerCase(),
          ),
      )
      .map((fact) => ({
        pageId: fact.objectPageId!,
        title: fact.object.trim(),
        type: fact.predicate,
        confidence: Number(fact.confidence),
      }));
    const backlinks = facts
      .filter(
        (fact) =>
          fact.reviewStatus === "accepted" &&
          fact.objectPageId === page.id &&
          fact.subjectPageId &&
          fact.subjectPageId !== page.id &&
          !relationshipPredicates.has(
            fact.predicate.trim().toLocaleLowerCase(),
          ),
      )
      .map((fact) => ({
        pageId: fact.subjectPageId!,
        title: fact.subject.trim(),
        type: fact.predicate,
        confidence: Number(fact.confidence),
      }));

    return Response.json(
      {
        detail: {
          page: { ...page, salience: Number(page.salience) },
          aliases,
          mergedFrom: mergedFromRows.map((row) => ({
            title: row.title,
            mergedAt: row.mergedAt,
          })),
          links,
          backlinks,
          facts: facts.map((fact) => ({
            ...fact,
            confidence: Number(fact.confidence),
            sourceVersionCreatedAt: fact.sourceVersionCreatedAt.toISOString(),
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load project brain page" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
