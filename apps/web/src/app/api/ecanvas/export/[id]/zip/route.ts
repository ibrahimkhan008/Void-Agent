import { Buffer } from "node:buffer";
import {
  CanvasExportIdSchema,
  MAX_CANVAS_EXPORT_HTML_BYTES,
  MAX_CANVAS_EXPORT_SCENE_BYTES,
} from "app-types/canvas-export";
import JSZip from "jszip";
import { pgCanvasExportRepository } from "lib/db/pg/repositories/canvas-export-repository.pg";
import {
  canvasExportJsonBytes,
  sanitizeCanvasExportFilename,
} from "lib/ecanvas/export-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!CanvasExportIdSchema.safeParse(id).success)
    return new Response("Not found", { status: 404 });

  try {
    const exported = await pgCanvasExportRepository.selectByIdForZip(id);
    if (!exported) return new Response("Not found", { status: 404 });
    if (
      new TextEncoder().encode(exported.html).byteLength >
        MAX_CANVAS_EXPORT_HTML_BYTES ||
      (exported.scene !== null &&
        exported.scene !== undefined &&
        canvasExportJsonBytes(exported.scene) > MAX_CANVAS_EXPORT_SCENE_BYTES)
    ) {
      return new Response("Export exceeds download limits", { status: 413 });
    }

    const zip = new JSZip();
    zip.file("index.html", exported.html);
    if (exported.scene) {
      zip.file("scene.json", JSON.stringify(exported.scene, null, 2));
    }
    zip.file(
      "metadata.json",
      JSON.stringify(
        {
          id: exported.id,
          title: exported.title,
          canvasId: exported.canvasId,
          createdAt: exported.createdAt,
          ...(exported.metadata ?? {}),
        },
        null,
        2,
      ),
    );

    const content = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const filename = sanitizeCanvasExportFilename(exported.title);
    return new Response(Buffer.from(content), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}.zip"`,
        "Content-Length": String(content.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Failed to build export archive" },
      { status: 503 },
    );
  }
}
