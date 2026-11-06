import { getSession } from "auth/server";
import { parseCsvPreview } from "lib/file-ingest/csv";
import { MAX_SHEET_PREVIEW_BYTES } from "lib/file-ingest/xlsx-preview-limits";
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

const MAX_ROWS = 100;
const MAX_COLUMNS = 40;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key");
  const sourceUrl = url.searchParams.get("url");
  const key = rawKey ?? (sourceUrl ? storageKeyFromUrl(sourceUrl) : null);
  if (!key || key.includes("..")) {
    return Response.json(
      { error: "A valid storage key is required", reason: "invalid_key" },
      { status: 400 },
    );
  }
  if (!isUserStorageKey(key, session.user.id)) {
    return Response.json(
      { error: "File not found", reason: "not_found" },
      { status: 404 },
    );
  }
  const extension = key.toLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") {
    return Response.json(
      {
        error: "Only XLSX and CSV files can be previewed",
        reason: "unsupported",
      },
      { status: 400 },
    );
  }
  const rate = await checkApiRateLimit({
    kind: "storage-sheet-preview",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many preview requests", { status: 429 });

  try {
    const metadata = await serverFileStorage.getMetadata(key);
    if (!metadata) {
      return Response.json(
        { error: "File not found", reason: "not_found" },
        { status: 404 },
      );
    }
    if (metadata.size > MAX_SHEET_PREVIEW_BYTES) {
      return Response.json(
        { error: "This file is too large to preview", reason: "too_large" },
        { status: 413 },
      );
    }
    const buffer = await serverFileStorage.download(key);
    if (buffer.byteLength > MAX_SHEET_PREVIEW_BYTES) {
      return Response.json(
        { error: "This file is too large to preview", reason: "too_large" },
        { status: 413 },
      );
    }
    const preview =
      extension === "csv"
        ? csvAsWorkbook(
            parseCsvPreview(buffer, {
              maxRows: MAX_ROWS,
              maxCols: MAX_COLUMNS,
            }),
          )
        : await import("lib/file-ingest/xlsx").then(({ parseXlsxPreview }) =>
            parseXlsxPreview(buffer, {
              maxRows: MAX_ROWS,
              maxCols: MAX_COLUMNS,
            }),
          );
    return Response.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("[storage] spreadsheet preview failed", error);
    return Response.json(
      { error: "The file could not be previewed", reason: "unreadable" },
      { status: 500 },
    );
  }
}

function csvAsWorkbook(preview: ReturnType<typeof parseCsvPreview>) {
  return {
    totalSheets: 1,
    sheets: [
      {
        name: "",
        header: preview.header,
        rows: preview.rows,
        totalRows: preview.totalRows,
        totalColumns: preview.columns,
        truncated:
          preview.totalRows - 1 > MAX_ROWS ||
          preview.header.length > MAX_COLUMNS,
      },
    ],
  };
}
