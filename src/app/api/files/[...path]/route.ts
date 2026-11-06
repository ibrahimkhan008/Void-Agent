import { getSession } from "auth/server";
import { FileNotFoundError } from "lib/errors";
import { serverFileStorage } from "lib/file-storage";
import {
  getContentTypeFromFilename,
  isUserStorageKey,
  resolveStoragePrefix,
} from "lib/file-storage/storage-utils";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import logger from "logger";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Detect the real image type from magic bytes so we serve the correct
// Content-Type even when the stored key's extension is wrong (the image
// proxy may return WebP/JPEG while the pipeline labels it .png).
const sniffContentType = (buf: Buffer): string | null => {
  if (buf.length >= 12) {
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "image/jpeg";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
      return "image/gif";
    if (
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    )
      return "image/webp";
  }
  return null;
};

/**
 * Serves generated local assets publicly and authenticated owner-scoped uploads
 * privately from the local file-storage driver.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    const key = (segments ?? []).map((s) => decodeURIComponent(s)).join("/");
    if (
      !key ||
      key.split(/[\\/]/).some((segment) => segment === "." || segment === "..")
    ) {
      return new Response("Not found", { status: 404 });
    }

    // User uploads share the public /api/files URL shape with generated assets.
    // Detect the configured owner prefix and require that owner for uploads;
    // generated files that have no owner segment retain their public behavior.
    const configuredPrefix = resolveStoragePrefix();
    const prefixDepth = configuredPrefix
      ? configuredPrefix.split("/").length
      : 0;
    const ownerId = key.split("/")[prefixDepth];
    const ownerScoped = Boolean(ownerId && isUserStorageKey(key, ownerId));
    if (ownerScoped) {
      const session = await getSession();
      if (!session?.user.id) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      if (session.user.id !== ownerId) {
        return new Response("Not found", {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      const rate = await checkApiRateLimit({
        kind: "storage-owner-file-read",
        id: session.user.id,
        limit: 120,
        windowMs: 60_000,
      });
      if (!rate.allowed) {
        return new Response("Too many requests", {
          status: 429,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }

    const buffer = await serverFileStorage.download(key);
    const contentType =
      sniffContentType(buffer) ?? getContentTypeFromFilename(key);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": ownerScoped
          ? "private, no-store"
          : "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.byteLength),
        // Defense-in-depth: files are untrusted user-uploaded/generated
        // content. These headers neutralize active content (e.g. legacy
        // SVGs uploaded before the SVG upload block) even if served with
        // an executable Content-Type.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    if (error instanceof FileNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    logger.error("[api/files] failed to serve file", error);
    return new Response("Internal error", { status: 500 });
  }
}
