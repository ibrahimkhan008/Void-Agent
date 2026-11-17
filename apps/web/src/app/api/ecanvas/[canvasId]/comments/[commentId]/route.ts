import { getSession } from "auth/server";
import { deleteCanvasElementComment } from "lib/db/pg/repositories/canvas-comment-repository.pg";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ canvasId: string; commentId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { canvasId, commentId } = await params;
  if (!UUID_PATTERN.test(canvasId) || !UUID_PATTERN.test(commentId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }
  try {
    const deleted = await deleteCanvasElementComment({
      userId: session.user.id,
      canvasId,
      commentId,
    });
    return deleted
      ? Response.json({ deleted: true })
      : Response.json({ error: "Comment not found" }, { status: 404 });
  } catch {
    return Response.json(
      { error: "Could not delete comment" },
      { status: 503 },
    );
  }
}
