import { getSession } from "auth/server";
import {
  MAX_DOCUMENT_PREVIEW_BYTES,
  MAX_DOCUMENT_PREVIEW_CHARS,
} from "lib/file-ingest/document-preview-limits";
import { parseDocxPreview } from "lib/file-ingest/docx";
import { parsePptxPreview } from "lib/file-ingest/pptx";
import { decodeTextFile } from "lib/file-ingest/text";
import { serverFileStorage } from "lib/file-storage";
import {
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const supported = new Set(["docx", "pptx", "txt", "md", "json"]);

export async function GET(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key");
  const sourceUrl = url.searchParams.get("url");
  const key = rawKey ?? (sourceUrl ? storageKeyFromUrl(sourceUrl) : null);
  if (!key || key.includes("..")) {
    return Response.json(
      { error: "A valid storage key is required" },
      { status: 400 },
    );
  }
  if (!isUserStorageKey(key, userId)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const extension = key.toLowerCase().split(".").pop() ?? "";
  if (!supported.has(extension)) {
    return Response.json(
      { error: "This file type cannot be previewed" },
      { status: 400 },
    );
  }

  const rate = await checkApiRateLimit({
    kind: "storage-document-preview",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many preview requests", { status: 429 });

  try {
    const metadata = await serverFileStorage.getMetadata(key);
    if (!metadata)
      return Response.json({ error: "File not found" }, { status: 404 });
    if (metadata.size > MAX_DOCUMENT_PREVIEW_BYTES) {
      return Response.json(
        { error: "This file is too large to preview" },
        { status: 413 },
      );
    }

    const content = await serverFileStorage.download(key);
    if (content.byteLength > MAX_DOCUMENT_PREVIEW_BYTES) {
      return Response.json(
        { error: "This file is too large to preview" },
        { status: 413 },
      );
    }

    let preview: { text: string; truncated: boolean; partial: boolean };
    if (extension === "docx") {
      const result = await parseDocxPreview(content, {
        maxChars: MAX_DOCUMENT_PREVIEW_CHARS,
      });
      // Raw-text extraction does not preserve Word layout, tables, or images.
      preview = { ...result, partial: true };
    } else if (extension === "pptx") {
      const result = await parsePptxPreview(content, {
        maxChars: MAX_DOCUMENT_PREVIEW_CHARS,
      });
      const sections = result.slides.map((slide) => {
        const title = slide.title ? `: ${slide.title}` : "";
        return `Slide ${slide.index}${title}${slide.hidden ? " (hidden)" : ""}\n\n${slide.text || "(no text)"}`;
      });
      const notices = [
        result.skipped ? `${result.skipped} slide(s) could not be read.` : "",
        result.truncated ? "Preview truncated; not every slide is shown." : "",
        "Text only: charts, SmartArt, embedded workbooks, and speaker notes are not included.",
      ].filter(Boolean);
      preview = {
        text: `Presentation has ${result.totalSlides} slide(s).\n\n${sections.join("\n\n")}\n\n${notices.join(" ")}`,
        truncated: result.truncated,
        partial: true,
      };
    } else {
      const result = decodeTextFile(content, {
        maxChars: MAX_DOCUMENT_PREVIEW_CHARS,
      });
      preview = {
        text: result.text,
        truncated: result.truncated,
        partial: result.replacedInvalidBytes,
      };
    }

    return Response.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("[storage] document preview failed", error);
    return Response.json(
      { error: "The file could not be previewed" },
      { status: 422 },
    );
  }
}
