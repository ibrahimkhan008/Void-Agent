import {
  CanvasExportCreateRequestSchema,
  MAX_CANVAS_EXPORT_REQUEST_BYTES,
} from "app-types/canvas-export";
import { getSession } from "auth/server";
import { pgCanvasExportRepository } from "lib/db/pg/repositories/canvas-export-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  try {
    const exports = await pgCanvasExportRepository.selectSummaryByExporterId(
      session.user.id,
    );
    return Response.json(
      { exports },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { error: "Failed to list canvas exports" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const rate = await checkApiRateLimit({
    kind: "canvas-export-create",
    id: session.user.id,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJson(request, MAX_CANVAS_EXPORT_REQUEST_BYTES);
  if (!body.ok) {
    return Response.json(
      { error: body.tooLarge ? "Request too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400 },
    );
  }
  const parsed = CanvasExportCreateRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "Invalid canvas export" }, { status: 400 });
  }

  try {
    const id = await pgCanvasExportRepository.insert({
      exporterId: session.user.id,
      canvasId: parsed.data.canvasId,
      title: parsed.data.title ?? `Canvas ${parsed.data.canvasId}`,
      html: parsed.data.html,
      scene: parsed.data.scene,
      metadata: parsed.data.metadata,
    });
    return Response.json(
      { id, url: `/ecanvas/export/${id}` },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Failed to create canvas export" },
      { status: 503 },
    );
  }
}
