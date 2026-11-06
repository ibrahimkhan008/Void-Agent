import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { readBoundedJson, reviewCellUpdateSchema } from "lib/tabular/review-cell-schema";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = await readBoundedJson(request);
  if (!body.ok) return Response.json({ error: body.reason === "too-large" ? "Request body too large" : "Invalid JSON body" }, { status: body.reason === "too-large" ? 413 : 400 });
  const parsed = reviewCellUpdateSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Invalid cell update" }, { status: 400 });

  const result = await pgDb.transaction(async (tx) => {
    const [review] = await tx
      .select({ id: TabularReviewTable.id, status: TabularReviewTable.status })
      .from(TabularReviewTable)
      .where(and(eq(TabularReviewTable.id, id), eq(TabularReviewTable.userId, session.user.id)))
      .for("update")
      .limit(1);
    if (!review) return "missing" as const;
    if (review.status === "generating") return "busy" as const;

    const [source] = await tx
      .select({ itemId: TabularReviewItemTable.itemId })
      .from(TabularReviewItemTable)
      .where(and(eq(TabularReviewItemTable.reviewId, id), eq(TabularReviewItemTable.itemId, parsed.data.itemId)))
      .limit(1);
    if (!source) return "missing" as const;

    const [cell] = await tx
      .update(TabularReviewCellTable)
      .set({ value: parsed.data.value, status: "done", updatedAt: new Date() })
      .where(and(
        eq(TabularReviewCellTable.reviewId, id),
        eq(TabularReviewCellTable.itemId, parsed.data.itemId),
        eq(TabularReviewCellTable.columnId, parsed.data.columnId),
      ))
      .returning({ itemId: TabularReviewCellTable.itemId });
    if (!cell) return "missing" as const;
    const cells = await tx
      .select({ status: TabularReviewCellTable.status })
      .from(TabularReviewCellTable)
      .where(eq(TabularReviewCellTable.reviewId, id));
    const status = cells.some((entry) => entry.status === "error")
      ? "error"
      : cells.every((entry) => entry.status === "done")
        ? "done"
        : "pending";
    await tx.update(TabularReviewTable).set({ status, updatedAt: new Date() }).where(eq(TabularReviewTable.id, id));
    return "updated" as const;
  });

  if (result === "missing") return new Response("Review cell not found", { status: 404 });
  if (result === "busy") return new Response("Cells cannot be edited while generation is running", { status: 409 });
  return Response.json({ ok: true });
}
