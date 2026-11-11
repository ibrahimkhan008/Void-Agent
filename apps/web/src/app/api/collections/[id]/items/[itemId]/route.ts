import { deleteOwnedCollectionItem } from "@/lib/collections/collection-service";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const DELETE = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, itemId } = await params;
  try {
    const deleted = await deleteOwnedCollectionItem({
      id,
      itemId,
      userId: session.user.id,
    });
    if (!deleted)
      return NextResponse.json(
        { error: "Collection item not found" },
        { status: 404 },
      );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete collection item", error);
    return NextResponse.json(
      { error: "Failed to delete collection item" },
      { status: 502 },
    );
  }
});
