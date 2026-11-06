import { Buffer } from "node:buffer";
import { getSession } from "auth/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  canAttachCollectionToProject,
  canWriteCollection,
  getCollectionAccess,
} from "lib/collections/access";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectDocumentTable,
} from "lib/db/pg/schema.pg";
import { serverFileStorage, storageDriver } from "lib/file-storage";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { IngestError, ingestText } from "lib/rag/ingest";
import { isParseableDocument, parseDocument } from "lib/rag/parse";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
const BLOCKED_MIME = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "text/javascript",
  "application/javascript",
  "application/ecmascript",
]);

function projectDocumentStorageIsPrivate() {
  if (storageDriver === "local") return true;
  if (storageDriver === "vercel-blob")
    return process.env.VERCEL_BLOB_ACCESS?.trim().toLowerCase() === "private";
  return /^(1|true)$/i.test(process.env.FILE_STORAGE_S3_PRIVATE ?? "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const collectionIds = access.project.collectionIds;
  const writableCollectionIds = mayEditProject(access.role)
    ? (
        await Promise.all(
          collectionIds.map(async (collectionId) => {
            const collectionAccess = await getCollectionAccess(
              collectionId,
              session.user.id,
            );
            return collectionAccess &&
              canAttachCollectionToProject(
                collectionAccess,
                session.user.id,
                access.project.teamId,
              ) &&
              canWriteCollection(collectionAccess.role)
              ? collectionId
              : null;
          }),
        )
      ).filter((id): id is string => id !== null)
    : [];
  if (!collectionIds.length)
    return Response.json({ documents: [], writableCollectionIds });
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const rows = await pgDb
    .select({
      id: CollectionItemTable.id,
      collectionId: CollectionItemTable.collectionId,
      filename: CollectionItemTable.filename,
      mediaType: CollectionItemTable.mediaType,
      status: CollectionItemTable.status,
      createdAt: CollectionItemTable.createdAt,
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
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
      ),
    )
    .orderBy(desc(ProjectDocumentTable.createdAt))
    .limit(100);
  return Response.json({ documents: rows, writableCollectionIds });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  const rate = await checkApiRateLimit({
    kind: "project-document-upload",
    id: `${session.user.id}:${projectId}`,
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed) return new Response("Too many uploads", { status: 429 });
  if (!projectDocumentStorageIsPrivate()) {
    return Response.json(
      { error: "Project documents require private file storage" },
      { status: 503 },
    );
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return new Response("Request too large", { status: 413 });
  }

  let multipartBody: Uint8Array | null;
  try {
    multipartBody = await readBoundedRequestBody(request, MAX_MULTIPART_BYTES);
  } catch {
    return Response.json({ error: "Invalid multipart form" }, { status: 400 });
  }
  if (multipartBody === null)
    return new Response("Request too large", { status: 413 });

  let form: FormData;
  try {
    const multipartBuffer = new ArrayBuffer(multipartBody.byteLength);
    new Uint8Array(multipartBuffer).set(multipartBody);
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: multipartBuffer,
    });
    form = await boundedRequest.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form" }, { status: 400 });
  }
  const collectionId = form.get("collectionId");
  const file = form.get("file");
  if (typeof collectionId !== "string" || !(file instanceof File)) {
    return Response.json(
      { error: "collectionId and file are required" },
      { status: 400 },
    );
  }
  if (!access.project.collectionIds.includes(collectionId)) {
    return new Response("Collection is not attached to this project", {
      status: 403,
    });
  }
  const collectionAccess = await getCollectionAccess(
    collectionId,
    session.user.id,
  );
  if (
    !canAttachCollectionToProject(
      collectionAccess,
      session.user.id,
      access.project.teamId,
    ) ||
    !collectionAccess ||
    !canWriteCollection(collectionAccess.role)
  ) {
    return new Response("Collection is not writable in this project", {
      status: 403,
    });
  }
  if (file.size === 0)
    return Response.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return new Response("File too large", { status: 413 });
  const filename = file.name.split(/[\\/]/).pop()?.slice(0, 240) || "document";
  const mediaType =
    (file.type || "application/octet-stream")
      .toLowerCase()
      .split(";")[0]
      ?.trim() ?? "application/octet-stream";
  if (
    BLOCKED_MIME.has(mediaType) ||
    !isParseableDocument(mediaType, filename)
  ) {
    return new Response("Unsupported or active file type", { status: 415 });
  }

  let storageKey: string | undefined;
  let collectionItemId: string | undefined;
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    parsed = await parseDocument(buffer, mediaType, filename);
  } catch {
    return Response.json(
      { error: "Could not parse document" },
      { status: 422 },
    );
  }

  try {
    const stored = await serverFileStorage.upload(buffer, {
      filename,
      contentType: mediaType,
      ownerId: session.user.id,
    });
    storageKey = stored.key;
    const ingest = await ingestText({
      collectionId,
      actorUserId: session.user.id,
      text: parsed.text,
      filename,
      mediaType,
      storageKey,
      sourceType: "file",
    });
    collectionItemId = ingest.itemId;
    const freshProjectAccess = await getProjectAccess(
      projectId,
      session.user.id,
    );
    if (
      !freshProjectAccess ||
      !mayEditProject(freshProjectAccess.role) ||
      !freshProjectAccess.project.collectionIds.includes(collectionId)
    ) {
      throw new Error("Project access changed during document upload");
    }
    await pgDb.insert(ProjectDocumentTable).values({
      projectId,
      collectionItemId: ingest.itemId,
      uploadedByUserId: session.user.id,
    });
    return Response.json(
      {
        document: {
          id: ingest.itemId,
          collectionId,
          filename,
          mediaType,
          status: "ready",
          size: buffer.byteLength,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof IngestError) {
      collectionItemId = error.collectionItemId;
    }
    if (collectionItemId) {
      await pgDb
        .delete(ProjectDocumentTable)
        .where(
          and(
            eq(ProjectDocumentTable.projectId, projectId),
            eq(ProjectDocumentTable.collectionItemId, collectionItemId),
          ),
        )
        .catch(() => undefined);
      await pgDb
        .delete(CollectionItemTable)
        .where(
          and(
            eq(CollectionItemTable.id, collectionItemId),
            eq(CollectionItemTable.collectionId, collectionId),
          ),
        )
        .catch(() => undefined);
    }
    if (storageKey)
      await serverFileStorage.delete(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Upload failed";
    if (
      message === "Collection access is no longer available" ||
      message === "Project access changed during document upload"
    ) {
      return new Response("Project or collection access changed", {
        status: 403,
      });
    }
    return Response.json(
      { error: "Project document upload failed" },
      { status: error instanceof IngestError ? 502 : 500 },
    );
  }
}
