import { createHash } from "node:crypto";
import { getSession } from "auth/server";
import { projectDocumentEditRepository } from "lib/db/pg/repositories/project-document-edit-repository.pg";
import { FileNotFoundError } from "lib/errors";
import { serverFileStorage } from "lib/file-storage";
import { sanitizeFilename } from "lib/file-storage/storage-utils";
import logger from "lib/logger";
import { projectDocumentEditSource } from "lib/projects/project-document-edit-access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; itemId: string; editId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId, itemId, editId } = await params;
  const access = await projectDocumentEditSource(
    projectId,
    itemId,
    session.user.id,
  );
  if (!access?.filename) return new Response("Not found", { status: 404 });
  const rate = await checkApiRateLimit({
    kind: "project-document-edit-download",
    id: `${session.user.id}:${projectId}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many downloads", { status: 429 });

  const edit = await projectDocumentEditRepository.selectByProject({
    id: editId,
    projectId,
  });
  if (!edit || edit.projectDocumentId !== access.projectDocumentId)
    return new Response("Not found", { status: 404 });
  if (
    edit.status === "pending" &&
    edit.candidateStorageKey &&
    access.storageKey
  ) {
    const sourceBytes = await serverFileStorage.downloadLimited(
      access.storageKey,
      20 * 1024 * 1024,
    );
    const currentHash = createHash("sha256").update(sourceBytes).digest("hex");
    if (currentHash !== edit.sourceRevisionHash) {
      await projectDocumentEditRepository.resolvePending({
        id: edit.id,
        projectId,
        currentSourceRevisionHash: currentHash,
        decision: "rejected",
      });
      return new Response("This tracked edit is stale", { status: 410 });
    }
  }
  const storageKey =
    edit.status === "pending"
      ? edit.candidateStorageKey
      : edit.status === "accepted"
        ? edit.outputStorageKey
        : null;
  if (!storageKey) return new Response("Not found", { status: 404 });

  try {
    const bytes = await serverFileStorage.downloadLimited(
      storageKey,
      20 * 1024 * 1024,
    );
    const filename =
      sanitizeFilename(access.filename).replace(/\.docx$/i, "") +
      (edit.status === "pending" ? "_tracked.docx" : "_edited.docx");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename.replaceAll('"', "")}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof FileNotFoundError)
      return new Response("Not found", { status: 404 });
    logger.error("[projects] tracked edit download failed", error);
    return new Response("Download failed", { status: 500 });
  }
}
