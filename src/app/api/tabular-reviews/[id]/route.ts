import { getSession } from "auth/server";
import { and, asc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
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

  const [items, cells] = await Promise.all([
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
  ]);
  return Response.json({ review, items, cells });
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
