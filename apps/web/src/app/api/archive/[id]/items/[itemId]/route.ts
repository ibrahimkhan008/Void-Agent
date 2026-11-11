import { removeOwnedThreadFromArchive } from "@/lib/archives/archive-service";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.string().uuid();

export const DELETE = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(itemId).success)
    return NextResponse.json(
      { error: "Archive item not found" },
      { status: 404 },
    );
  try {
    const removed = await removeOwnedThreadFromArchive({
      archiveId: id,
      threadId: itemId,
      userId: session.user.id,
    });
    if (!removed)
      return NextResponse.json(
        { error: "Archive item not found" },
        { status: 404 },
      );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to remove archive item", error);
    return NextResponse.json(
      { error: "Failed to remove archive item" },
      { status: 500 },
    );
  }
});
