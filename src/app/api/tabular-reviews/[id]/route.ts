import { getSession } from "auth/server";
import { and, asc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  DocumentTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewSourceDocumentTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { hasSameOrigin } from "lib/security/same-origin";

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
        createdAt: DocumentTable.createdAt,
      })
      .from(TabularReviewSourceDocumentTable)
      .leftJoin(
        DocumentTable,
        eq(DocumentTable.id, TabularReviewSourceDocumentTable.documentId),
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
    cells,
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
