import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import {
  canDeleteCollection,
  canWriteCollection,
  getCollectionAccess,
} from "lib/collections/access";
import { collectionRepository } from "lib/db/repository";
import { hasSameOrigin } from "lib/security/same-origin";

// ---------------------------------------------------------------------------
// P2.1 follow-up — /api/collections/[id]
// ---------------------------------------------------------------------------
//   GET     one collection + its items (with chunk counts)
//   DELETE  the collection (cascades to items -> documents -> chunks)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  try {
    const access = await getCollectionAccess(id, session.user.id);
    // Same 404 for "missing" and "not yours" so the endpoint can't be
    // used to probe for other users' collection ids.
    if (!access) {
      return new Response("Not found", { status: 404 });
    }

    const items = await collectionRepository.listAccessibleCollectionItems(
      id,
      session.user.id,
    );
    const counts = await collectionRepository.countChunksForItems(
      items.map((i) => i.id),
    );
    return Response.json({
      collection: access.collection,
      access: {
        role: access.role,
        canWrite: canWriteCollection(access.role),
        canDelete: canDeleteCollection(access, session.user.id),
      },
      items: items.map((i) => ({ ...i, chunkCount: counts[i.id] ?? 0 })),
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  try {
    const access = await getCollectionAccess(id, session.user.id);
    if (!access) {
      return new Response("Not found", { status: 404 });
    }
    if (!canDeleteCollection(access, session.user.id)) {
      return new Response("Forbidden", { status: 403 });
    }
    const deleted = await collectionRepository.deleteCollection(
      id,
      session.user.id,
    );
    if (!deleted) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
