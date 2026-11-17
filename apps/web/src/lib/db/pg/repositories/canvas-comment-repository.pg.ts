import { and, asc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { CanvasCommentTable } from "lib/db/pg/schema.pg";

export async function listCanvasElementComments(input: {
  userId: string;
  canvasId: string;
  elementId: string;
}) {
  return pgDb
    .select({
      id: CanvasCommentTable.id,
      elementId: CanvasCommentTable.elementId,
      body: CanvasCommentTable.body,
      createdAt: CanvasCommentTable.createdAt,
    })
    .from(CanvasCommentTable)
    .where(
      and(
        eq(CanvasCommentTable.userId, input.userId),
        eq(CanvasCommentTable.canvasId, input.canvasId),
        eq(CanvasCommentTable.elementId, input.elementId),
      ),
    )
    .orderBy(asc(CanvasCommentTable.createdAt))
    .limit(100);
}

export async function createCanvasElementComment(input: {
  userId: string;
  canvasId: string;
  elementId: string;
  body: string;
}) {
  const [comment] = await pgDb
    .insert(CanvasCommentTable)
    .values(input)
    .returning({
      id: CanvasCommentTable.id,
      elementId: CanvasCommentTable.elementId,
      body: CanvasCommentTable.body,
      createdAt: CanvasCommentTable.createdAt,
    });
  if (!comment) throw new Error("Canvas comment was not created");
  return comment;
}

export async function deleteCanvasElementComment(input: {
  userId: string;
  canvasId: string;
  commentId: string;
}): Promise<boolean> {
  const deleted = await pgDb
    .delete(CanvasCommentTable)
    .where(
      and(
        eq(CanvasCommentTable.id, input.commentId),
        eq(CanvasCommentTable.userId, input.userId),
        eq(CanvasCommentTable.canvasId, input.canvasId),
      ),
    )
    .returning({ id: CanvasCommentTable.id });
  return deleted.length > 0;
}
