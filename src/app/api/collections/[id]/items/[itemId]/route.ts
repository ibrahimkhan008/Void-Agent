import { getSession } from "auth/server";
import {
  canWriteCollection,
  getCollectionAccess,
} from "lib/collections/access";
import { collectionRepository } from "lib/db/repository";
import { processFileCleanupOutbox } from "lib/file-storage/cleanup-outbox";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

/** Delete a private file-backed knowledge item when no project/workflow uses it. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id, itemId } = await params;

  const access = await getCollectionAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!canWriteCollection(access.role))
    return new Response("Forbidden", { status: 403 });

  try {
    const deletion = await collectionRepository.deleteCollectionItem(
      itemId,
      id,
      session.user.id,
    );
    if (deletion.status === "not-found")
      return new Response("Not found", { status: 404 });
    if (deletion.status === "unsafe-key") {
      return Response.json(
        { error: "This file is not owned by your account" },
        { status: 409 },
      );
    }
    if (deletion.status === "shared-object") {
      return Response.json(
        { error: "This file is attached to another collection" },
        { status: 409 },
      );
    }
    if (deletion.status === "referenced") {
      return Response.json(
        {
          error:
            "Remove this file from its projects, reviews, or project-brain records before deleting it",
        },
        { status: 409 },
      );
    }
    if (deletion.status === "queued") {
      const cleanup = await processFileCleanupOutbox(deletion.outboxId);
      if (cleanup.failed || cleanup.completed === 0) {
        return Response.json(
          {
            deleted: true,
            storageCleanup: "pending",
            message:
              "The knowledge item was deleted; its private file is queued for retry.",
          },
          { status: 202 },
        );
      }
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[collections.item.delete] failed", { itemId, error });
    return Response.json(
      { error: "Failed to delete collection item" },
      { status: 500 },
    );
  }
}
