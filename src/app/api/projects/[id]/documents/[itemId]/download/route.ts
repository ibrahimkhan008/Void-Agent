import { getSession } from "auth/server";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectDocumentTable,
} from "lib/db/pg/schema.pg";
import { FileNotFoundError } from "lib/errors";
import { serverFileStorage } from "lib/file-storage";
import {
  getContentTypeFromFilename,
  sanitizeFilename,
} from "lib/file-storage/storage-utils";
import logger from "lib/logger";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId, itemId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const rate = await checkApiRateLimit({
    kind: "project-document-download",
    id: `${session.user.id}:${projectId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many downloads", { status: 429 });
  const collectionIds = access.project.collectionIds;
  if (!collectionIds.length) return new Response("Not found", { status: 404 });
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const [row] = await pgDb
    .select({
      filename: CollectionItemTable.filename,
      mediaType: CollectionItemTable.mediaType,
      storageKey: CollectionItemTable.storageKey,
      status: CollectionItemTable.status,
    })
    .from(ProjectDocumentTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectDocumentTable.collectionItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectDocumentTable.projectId, projectId),
        eq(ProjectDocumentTable.collectionItemId, itemId),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);
  if (!row?.storageKey || !row.filename)
    return new Response("Not found", { status: 404 });

  try {
    const bytes = await serverFileStorage.download(row.storageKey);
    const filename = sanitizeFilename(row.filename).replaceAll('"', "");
    const contentType = getContentTypeFromFilename(filename);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof FileNotFoundError)
      return new Response("Not found", { status: 404 });
    logger.error("[projects] original document download failed", error);
    return new Response("Download failed", { status: 500 });
  }
}
