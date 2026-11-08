import { getSession } from "auth/server";
import { and, asc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewSourceDocumentTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { hasSameOrigin } from "lib/security/same-origin";
import type { ReviewColumn } from "lib/tabular/review-schema";
import { TABULAR_REVIEW_MAX_SOURCE_CHARS } from "lib/tabular/review-schema";
import { resolvePinnedReviewCitationEvidence } from "lib/tabular/review-source";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [review] = await pgDb
    .select()
    .from(TabularReviewTable)
    .where(
      and(
        eq(TabularReviewTable.id, id),
        eq(TabularReviewTable.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!review) return new Response("Review not found", { status: 404 });

  const [items, cells, sourcePages] = await Promise.all([
    pgDb
      .select({
        itemId: TabularReviewItemTable.itemId,
        rowIndex: TabularReviewItemTable.rowIndex,
        filename: CollectionItemTable.filename,
      })
      .from(TabularReviewItemTable)
      .innerJoin(
        CollectionItemTable,
        eq(CollectionItemTable.id, TabularReviewItemTable.itemId),
      )
      .where(eq(TabularReviewItemTable.reviewId, id))
      .orderBy(asc(TabularReviewItemTable.rowIndex)),
    pgDb
      .select()
      .from(TabularReviewCellTable)
      .where(eq(TabularReviewCellTable.reviewId, id)),
    pgDb
      .select({
        itemId: TabularReviewSourceDocumentTable.itemId,
        documentId: TabularReviewSourceDocumentTable.documentId,
        position: TabularReviewSourceDocumentTable.position,
        content: DocumentTable.content,
        createdAt: DocumentTable.createdAt,
        sourceOwnerId: CollectionTable.userId,
        sourceStatus: CollectionItemTable.status,
      })
      .from(TabularReviewSourceDocumentTable)
      .leftJoin(
        DocumentTable,
        eq(DocumentTable.id, TabularReviewSourceDocumentTable.documentId),
      )
      .leftJoin(
        CollectionItemTable,
        eq(CollectionItemTable.id, TabularReviewSourceDocumentTable.itemId),
      )
      .leftJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(eq(TabularReviewSourceDocumentTable.reviewId, id)),
  ]);
  const sourceSummary = new Map<
    string,
    { pinned: number; available: number; latestAt: Date | null }
  >();
  for (const page of sourcePages) {
    const current = sourceSummary.get(page.itemId) ?? {
      pinned: 0,
      available: 0,
      latestAt: null,
    };
    current.pinned += 1;
    if (page.documentId && page.createdAt) {
      current.available += 1;
      if (!current.latestAt || page.createdAt > current.latestAt)
        current.latestAt = page.createdAt;
    }
    sourceSummary.set(page.itemId, current);
  }
  const pagesByItem = new Map<
    string,
    Array<{
      documentId: string | null;
      position: number;
      content: string | null;
    }>
  >();
  for (const page of sourcePages) {
    const pages = pagesByItem.get(page.itemId) ?? [];
    const callerStillOwnsReadySource =
      page.sourceOwnerId === session.user.id && page.sourceStatus === "ready";
    pages.push({
      documentId: callerStillOwnsReadySource ? page.documentId : null,
      position: page.position,
      content: callerStillOwnsReadySource ? page.content : null,
    });
    pagesByItem.set(page.itemId, pages);
  }
  const citationColumnIds = new Set(
    (review.columns as ReviewColumn[])
      .filter((column) => column.type === "citation")
      .map((column) => column.id),
  );
  const cellsWithCitationEvidence = cells.map((cell) => ({
    ...cell,
    ...(citationColumnIds.has(cell.columnId) && cell.value
      ? {
          citationEvidence: resolvePinnedReviewCitationEvidence(
            cell.value,
            pagesByItem.get(cell.itemId) ?? [],
            TABULAR_REVIEW_MAX_SOURCE_CHARS,
          ),
        }
      : {}),
  }));
  return Response.json({
    review,
    items: items.map((item) => {
      const summary = sourceSummary.get(item.itemId);
      return {
        ...item,
        sourceDocumentCount: summary?.pinned ?? 0,
        availableSourceDocumentCount: summary?.available ?? 0,
        latestSourceCreatedAt: summary?.latestAt?.toISOString() ?? null,
      };
    }),
    cells: cellsWithCitationEvidence,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(_request))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const deleted = await pgDb
    .delete(TabularReviewTable)
    .where(
      and(
        eq(TabularReviewTable.id, id),
        eq(TabularReviewTable.userId, session.user.id),
      ),
    )
    .returning({ id: TabularReviewTable.id });
  return deleted.length
    ? new Response(null, { status: 204 })
    : new Response("Review not found", { status: 404 });
}
