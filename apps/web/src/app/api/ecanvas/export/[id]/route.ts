import { CanvasExportIdSchema } from "app-types/canvas-export";
import { getSession } from "auth/server";
import { pgCanvasExportRepository } from "lib/db/pg/repositories/canvas-export-repository.pg";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!CanvasExportIdSchema.safeParse(id).success)
    return new Response("Not found", { status: 404 });

  try {
    const exported = await pgCanvasExportRepository.selectByIdPublic(id);
    if (!exported) return new Response("Not found", { status: 404 });
    return Response.json(exported, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Failed to load export" }, { status: 503 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  if (!CanvasExportIdSchema.safeParse(id).success)
    return new Response("Not found", { status: 404 });

  try {
    const revoked = await pgCanvasExportRepository.revokeById(
      id,
      session.user.id,
    );
    if (!revoked) return new Response("Not found", { status: 404 });
    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Failed to revoke export" }, { status: 503 });
  }
}
