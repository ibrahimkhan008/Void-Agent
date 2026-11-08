import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseXlsxPreview: vi.fn(),
  formatXlsxPreviewText: vi.fn(),
  parsePptxPreview: vi.fn(),
  formatPptxPreviewText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/file-ingest/xlsx", () => ({
  parseXlsxPreview: mocks.parseXlsxPreview,
  formatXlsxPreviewText: mocks.formatXlsxPreviewText,
}));
vi.mock("lib/file-ingest/pptx", () => ({
  parsePptxPreview: mocks.parsePptxPreview,
  formatPptxPreviewText: mocks.formatPptxPreviewText,
}));

import {
  LEGACY_DOC_MEDIA_TYPE,
  PPTX_MEDIA_TYPE,
  XLSX_MEDIA_TYPE,
  isParseableDocument,
  parseDocument,
  resolveParsedKind,
} from "./parse";

describe("project document parsing formats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseXlsxPreview.mockResolvedValue({
      sheets: [{ name: "Summary", header: ["Quarter"], rows: [["Q1"]] }],
      totalSheets: 1,
    });
    mocks.formatXlsxPreviewText.mockReturnValue({
      text: "Workbook Summary\nQ1",
      truncated: false,
    });
    mocks.parsePptxPreview.mockResolvedValue({
      slides: [{ index: 1, title: "Roadmap", text: "Launch" }],
      totalSlides: 1,
      skipped: 0,
      truncated: false,
      partial: true,
    });
    mocks.formatPptxPreviewText.mockReturnValue("Presentation Roadmap\nLaunch");
  });

  it("recognizes and ingests XLSX through the hardened bounded preview parser", async () => {
    expect(resolveParsedKind(XLSX_MEDIA_TYPE, "budget.xlsx")).toBe("xlsx");
    expect(isParseableDocument("application/octet-stream", "budget.xlsx")).toBe(
      true,
    );

    const parsed = await parseDocument(
      Buffer.from("xlsx bytes"),
      XLSX_MEDIA_TYPE,
      "budget.xlsx",
    );

    expect(parsed).toEqual({ text: "Workbook Summary\nQ1", kind: "xlsx" });
    expect(mocks.parseXlsxPreview).toHaveBeenCalledWith(expect.any(Buffer), {
      maxRows: 100,
      maxCols: 40,
      maxSheets: 10,
    });
    expect(mocks.formatXlsxPreviewText).toHaveBeenCalledWith(
      "budget.xlsx",
      expect.anything(),
      { maxChars: 120_000 },
    );
  });

  it("recognizes and ingests PPTX with bounded slides and extracted text", async () => {
    expect(resolveParsedKind(PPTX_MEDIA_TYPE, "roadmap.pptx")).toBe("pptx");

    const parsed = await parseDocument(
      Buffer.from("pptx bytes"),
      PPTX_MEDIA_TYPE,
      "roadmap.pptx",
    );

    expect(parsed).toEqual({
      text: "Presentation Roadmap\nLaunch",
      kind: "pptx",
    });
    expect(mocks.parsePptxPreview).toHaveBeenCalledWith(expect.any(Buffer), {
      maxSlides: 200,
      maxChars: 120_000,
    });
    expect(mocks.formatPptxPreviewText).toHaveBeenCalledWith(
      "roadmap.pptx",
      expect.anything(),
    );
  });

  it("continues to reject legacy OLE DOC files", () => {
    expect(resolveParsedKind(LEGACY_DOC_MEDIA_TYPE, "legacy.doc")).toBe(
      "unsupported",
    );
    expect(isParseableDocument(LEGACY_DOC_MEDIA_TYPE, "legacy.doc")).toBe(
      false,
    );
  });
});
