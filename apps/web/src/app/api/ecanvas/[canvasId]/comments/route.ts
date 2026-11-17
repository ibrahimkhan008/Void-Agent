import { getSession } from "auth/server";
import {
  createCanvasElementComment,
  listCanvasElementComments,
} from "lib/db/pg/repositories/canvas-comment-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ElementIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/u);
const CommentSchema = z.object({
  elementId: ElementIdSchema,
  body: z.string().trim().min(1).max(5_000),
});

type RouteContext = { params: Promise<{ canvasId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { canvasId } = await params;
  if (!UUID_PATTERN.test(canvasId)) {
    return Response.json({ error: "Invalid canvas ID" }, { status: 400 });
  }
  const elementId = new URL(request.url).searchParams.get("elementId") ?? "";
  if (!ElementIdSchema.safeParse(elementId).success) {
    return Response.json({ error: "Invalid element ID" }, { status: 400 });
  }
  try {
    const comments = await listCanvasElementComments({
      userId: session.user.id,
      canvasId,
      elementId,
    });
    return Response.json(
      { comments },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Could not load comments" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { canvasId } = await params;
  if (!UUID_PATTERN.test(canvasId)) {
    return Response.json({ error: "Invalid canvas ID" }, { status: 400 });
  }
  const rate = await checkApiRateLimit({
    kind: "ecanvas-comment-create",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const payload = await readBoundedJson(request, 8 * 1024);
  if (!payload.ok) {
    return Response.json(
      { error: payload.tooLarge ? "Request too large" : "Invalid JSON" },
      { status: payload.tooLarge ? 413 : 400 },
    );
  }
  const parsed = CommentSchema.safeParse(payload.value);
  if (!parsed.success) {
    return Response.json({ error: "Invalid comment" }, { status: 400 });
  }
  try {
    const comment = await createCanvasElementComment({
      userId: session.user.id,
      canvasId,
      ...parsed.data,
    });
    return Response.json(
      { comment },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Could not save comment" }, { status: 503 });
  }
}
