import { getSession } from "auth/server";
import {
  getEcanvasArtifact,
  upsertEcanvasArtifact,
} from "lib/db/pg/repositories/ecanvas-artifact-repository.pg";
import { MAX_HTML_BYTES } from "lib/ecanvas/content-store";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";
const CANVAS_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { canvasId } = await params;
  if (!CANVAS_ID_PATTERN.test(canvasId))
    return Response.json({ error: "Invalid canvas ID" }, { status: 400 });
  try {
    const html = await getEcanvasArtifact({
      userId: session.user.id,
      canvasId,
    });
    return Response.json(
      { html },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load canvas artifact" },
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { canvasId } = await params;
  if (!CANVAS_ID_PATTERN.test(canvasId))
    return Response.json({ error: "Invalid canvas ID" }, { status: 400 });

  const rate = await checkApiRateLimit({
    kind: "ecanvas-content",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJson(request, MAX_HTML_BYTES + 1_024);
  if (!body.ok) {
    return Response.json(
      { error: body.tooLarge ? "HTML exceeds its size limit" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400 },
    );
  }
  if (
    !body.value ||
    typeof body.value !== "object" ||
    Array.isArray(body.value) ||
    typeof (body.value as { html?: unknown }).html !== "string"
  ) {
    return Response.json({ error: "html field required" }, { status: 400 });
  }
  const html = (body.value as { html: string }).html;
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES)
    return Response.json(
      { error: "HTML exceeds its size limit" },
      { status: 413 },
    );

  try {
    await upsertEcanvasArtifact({
      userId: session.user.id,
      canvasId,
      html,
    });
    return Response.json(
      { stored: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to save canvas artifact" },
      { status: 503 },
    );
  }
}
