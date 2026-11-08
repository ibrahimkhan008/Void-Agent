import { getSession } from "auth/server";
import { FileNotFoundError } from "lib/errors";
import { serverFileStorage } from "lib/file-storage";
import {
  getContentTypeFromFilename,
  isUserStorageKey,
  sanitizeFilename,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/wav",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
  "video/webm",
]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key");
  const sourceUrl = url.searchParams.get("url");
  const key = rawKey ?? (sourceUrl ? storageKeyFromUrl(sourceUrl) : null);
  if (!key || key.includes(".."))
    return new Response("Invalid file", { status: 400 });
  if (!isUserStorageKey(key, session.user.id))
    return new Response("Not found", { status: 404 });
  const rate = await checkApiRateLimit({
    kind: "storage-private-download",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many downloads", { status: 429 });

  try {
    const filename = safeDownloadFilename(key);
    const metadata = await serverFileStorage.getMetadata(key).catch(() => null);
    const storedContentType = metadata?.contentType
      ?.toLowerCase()
      .split(";", 1)[0]
      .trim();
    const contentType = metadata
      ? storedContentType && INLINE_TYPES.has(storedContentType)
        ? storedContentType
        : "application/octet-stream"
      : getContentTypeFromFilename(filename);
    const inline =
      url.searchParams.get("disposition") === "inline" &&
      INLINE_TYPES.has(contentType);

    // Proxy bytes instead of redirecting to the object store. This ensures
    // authenticated responses keep safe MIME, disposition and cache headers.
    const buffer = await serverFileStorage.download(key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replaceAll('"', "")}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof FileNotFoundError)
      return new Response("Not found", { status: 404 });
    logger.error("[storage] authenticated download failed", error);
    return new Response("Download failed", { status: 500 });
  }
}

function safeDownloadFilename(key: string) {
  const base = key.split("/").pop() ?? "download";
  return sanitizeFilename(base.replace(/^[0-9a-f-]{36}-/i, ""));
}
