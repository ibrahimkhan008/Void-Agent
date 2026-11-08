import { getSession } from "auth/server";
import {
  SANDBOX_HTML_PREVIEW_CSP,
  sanitizeSandboxHtmlPreview,
  wrapSandboxHtmlPreview,
} from "lib/file-ingest/sandbox-html-preview";
import { serverFileStorage } from "lib/file-storage";
import {
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { MAX_SANDBOX_ARTIFACT_BYTES } from "lib/sandbox/artifact-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key");
  const sourceUrl = url.searchParams.get("url");
  const key = rawKey ?? (sourceUrl ? storageKeyFromUrl(sourceUrl) : null);
  if (!key || key.includes(".."))
    return new Response("Invalid file", { status: 400 });
  if (!isUserStorageKey(key, userId))
    return new Response("Not found", { status: 404 });
  if (!key.toLowerCase().endsWith(".html"))
    return new Response("Unsupported file", { status: 400 });

  const rate = await checkApiRateLimit({
    kind: "storage-private-html-preview",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many previews", { status: 429 });

  try {
    const metadata = await serverFileStorage.getMetadata(key).catch(() => null);
    if (!metadata) return new Response("Not found", { status: 404 });
    if (
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 0 ||
      metadata.size > MAX_SANDBOX_ARTIFACT_BYTES
    ) {
      return new Response("File is too large to preview", { status: 413 });
    }

    const content = await serverFileStorage.download(key);
    if (
      content.byteLength > MAX_SANDBOX_ARTIFACT_BYTES ||
      content.byteLength !== metadata.size
    ) {
      return new Response("File changed or is too large to preview", {
        status: content.byteLength > MAX_SANDBOX_ARTIFACT_BYTES ? 413 : 409,
      });
    }

    let html: string;
    try {
      html = new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      return new Response("HTML file is not valid UTF-8", { status: 422 });
    }

    const safeHtml = wrapSandboxHtmlPreview(sanitizeSandboxHtmlPreview(html));
    return new Response(safeHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'inline; filename="artifact-preview.html"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": SANDBOX_HTML_PREVIEW_CSP,
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    logger.error("[storage] private HTML preview failed", error);
    return new Response("Preview unavailable", { status: 422 });
  }
}
