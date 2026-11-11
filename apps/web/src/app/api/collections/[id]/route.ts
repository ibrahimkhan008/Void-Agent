import {
  deleteOwnedCollection,
  getOwnedCollection,
  listOwnedCollectionItems,
  toCollectionShape,
} from "@/lib/collections/collection-service";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session, { params }) => {
  const { id } = await params;
  try {
    const collection = await getOwnedCollection(id, session.user.id);
    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 },
      );
    }
    const page = await listOwnedCollectionItems({
      id,
      userId: session.user.id,
    });
    return NextResponse.json({
      collection: toCollectionShape(collection),
      items: page?.items ?? [],
      nextCursor: page?.nextCursor ?? null,
    });
  } catch (error) {
    console.error("Failed to load collection", error);
    return NextResponse.json(
      { error: "Failed to load collection" },
      { status: 500 },
    );
  }
});

export const DELETE = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const deleted = await deleteOwnedCollection(id, session.user.id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 },
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete collection", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 502 },
    );
  }
});
