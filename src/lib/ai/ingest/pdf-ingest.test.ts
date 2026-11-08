import { Buffer } from "node:buffer";
import type { ChatAttachment } from "app-types/chat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractPdfPreview: vi.fn(),
  rasterizePdfPages: vi.fn(),
}));

vi.mock("lib/file-ingest/pdf-preview", () => ({
  MAX_PDF_PREVIEW_PAGES: 50,
  extractPdfPreview: mocks.extractPdfPreview,
}));
vi.mock("./pdf-rasterize", () => ({
  rasterizePdfPages: mocks.rasterizePdfPages,
}));

import {
  MAX_PDF_INGEST_BYTES,
  buildPdfIngestionPreviewParts,
} from "./pdf-ingest";

const pdfBytes = Buffer.from("%PDF-1.7\nvalid fixture bytes", "ascii");
const attachment = (
  overrides: Partial<ChatAttachment> = {},
): ChatAttachment => ({
  type: "file",
  url: "/api/files/uploads/user-1/report.pdf",
  mediaType: "application/pdf",
  filename: "report.pdf",
  ...overrides,
});

describe("PDF chat ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractPdfPreview.mockResolvedValue({
      text: "invoice text",
      totalPages: 1,
      pagesShown: 1,
      truncated: false,
      partial: true,
    });
    mocks.rasterizePdfPages.mockResolvedValue([
      {
        pageNumber: 1,
        url: "data:image/png;base64,cG5n",
        mediaType: "image/png",
        filename: "report.pdf (page 1)",
        byteLength: 3,
      },
    ]);
  });

  it("passes bounded text and vision page parts into model-ready message parts", async () => {
    const download = vi.fn(async (_key: string, maxBytes: number) => {
      expect(maxBytes).toBe(MAX_PDF_INGEST_BYTES);
      return pdfBytes;
    });
    const parts = await buildPdfIngestionPreviewParts(
      [attachment()],
      download,
      "user-1",
      true,
    );

    expect(download).toHaveBeenCalledWith(
      "uploads/user-1/report.pdf",
      MAX_PDF_INGEST_BYTES,
    );
    expect(mocks.extractPdfPreview).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { maxChars: 8_000, maxPages: 50 },
    );
    expect(mocks.rasterizePdfPages).toHaveBeenCalledWith(
      pdfBytes,
      "report.pdf",
      { maxTotalBytes: 6 * 1024 * 1024 },
    );
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          ingestionPreview: true,
          text: expect.stringContaining("invoice text"),
        }),
        expect.objectContaining({
          type: "file",
          mediaType: "image/png",
          url: "data:image/png;base64,cG5n",
          ingestionPreview: true,
        }),
      ]),
    );
  });

  it("keeps text extraction for text-only models and does not rasterize", async () => {
    const parts = await buildPdfIngestionPreviewParts(
      [attachment()],
      async () => pdfBytes,
      "user-1",
      false,
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]?.type).toBe("text");
    expect(mocks.rasterizePdfPages).not.toHaveBeenCalled();
  });

  it("does not download a foreign owner's storage key", async () => {
    const download = vi.fn();
    const parts = await buildPdfIngestionPreviewParts(
      [attachment({ url: "/api/files/uploads/user-2/private.pdf" })],
      download,
      "user-1",
      true,
    );
    expect(parts).toEqual([]);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a non-PDF payload even when filename and MIME claim PDF", async () => {
    const parts = await buildPdfIngestionPreviewParts(
      [attachment()],
      async () => Buffer.from("<html>not a PDF</html>"),
      "user-1",
      true,
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]?.type).toBe("text");
    if (parts[0]?.type !== "text") throw new Error("Expected PDF status text");
    expect(parts[0].text).toContain("valid PDF header");
    expect(mocks.extractPdfPreview).not.toHaveBeenCalled();
    expect(mocks.rasterizePdfPages).not.toHaveBeenCalled();
  });

  it("reports download-limit failures without leaking storage details", async () => {
    const parts = await buildPdfIngestionPreviewParts(
      [attachment()],
      async () => {
        throw new Error("private storage object details");
      },
      "user-1",
    );
    const firstPart = parts[0];
    expect(firstPart?.type).toBe("text");
    if (firstPart?.type !== "text") throw new Error("Expected PDF status text");
    expect(firstPart.text).toContain("15 MiB processing limit");
    expect(firstPart.text).not.toContain("private storage");
  });

  it("deduplicates repeated attachments and caps the number processed", async () => {
    const repeated = attachment();
    const attachments = [
      repeated,
      repeated,
      ...Array.from({ length: 6 }, (_, index) =>
        attachment({
          url: `/api/files/uploads/user-1/${index}.pdf`,
          filename: `${index}.pdf`,
        }),
      ),
    ];
    const download = vi.fn(async () => pdfBytes);
    await buildPdfIngestionPreviewParts(attachments, download, "user-1");
    expect(download).toHaveBeenCalledTimes(4);
  });
});
