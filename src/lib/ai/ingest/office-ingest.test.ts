import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { buildOfficeIngestionPreviewParts } from "./office-ingest";

describe("office and text attachment ingestion", () => {
  it("extracts bounded plain text from owned-chat attachment references", async () => {
    const download = vi
      .fn()
      .mockResolvedValue(
        Buffer.from("\uFEFF# Notes\n\nHello from a text attachment."),
      );
    const parts = await buildOfficeIngestionPreviewParts(
      [
        {
          type: "source-url",
          url: "/api/files/uploads/user-1/notes.md",
          filename: "notes.md",
          mediaType: "text/markdown",
        },
      ],
      download,
      "user-1",
    );
    expect(download).toHaveBeenCalledWith("uploads/user-1/notes.md");
    expect(parts).toHaveLength(1);
    expect(parts[0].ingestionPreview).toBe(true);
    expect(parts[0].text).toContain("Hello from a text attachment.");
    expect(parts[0].text).toContain("untrusted file data");
  });

  it("does not download unsupported formats and reports oversized files", async () => {
    const download = vi
      .fn()
      .mockResolvedValue(Buffer.alloc(15 * 1024 * 1024 + 1));
    const parts = await buildOfficeIngestionPreviewParts(
      [
        {
          type: "file",
          url: "/api/files/uploads/user-1/archive.zip",
          filename: "archive.zip",
        },
        {
          type: "file",
          url: "/api/files/uploads/user-1/deck.pptx",
          filename: "deck.pptx",
        },
      ],
      download,
      "user-1",
    );
    expect(download).toHaveBeenCalledTimes(1);
    expect(parts[0].text).toContain("exceeds the 15 MiB processing limit");
  });

  it("does not read an office document outside the authenticated owner's prefix", async () => {
    const download = vi.fn();
    const parts = await buildOfficeIngestionPreviewParts(
      [
        {
          type: "file",
          url: "/api/files/uploads/user-2/private.docx",
          filename: "private.docx",
        },
      ],
      download,
      "user-1",
    );
    expect(parts).toEqual([]);
    expect(download).not.toHaveBeenCalled();
  });

  it("bounds aggregate extracted text across attachments", async () => {
    const download = vi.fn().mockResolvedValue(Buffer.from("x".repeat(20_000)));
    const parts = await buildOfficeIngestionPreviewParts(
      Array.from({ length: 5 }, (_, index) => ({
        type: "file" as const,
        url: `/api/files/uploads/user-1/file-${index}.txt`,
        filename: `file-${index}.txt`,
        mediaType: "text/plain",
      })),
      download,
      "user-1",
    );
    const contentCharacters = parts.reduce(
      (sum, part) => sum + part.text.split("\n").slice(1).join("\n").length,
      0,
    );
    expect(parts).toHaveLength(2);
    expect(contentCharacters).toBeLessThanOrEqual(40_000);
  });

  it("reads an XLSX attachment through bounded OOXML validation and preview", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Quarterly");
    sheet.addRow(["Metric", "Value"]);
    sheet.addRow(["Active users", 123]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const parts = await buildOfficeIngestionPreviewParts(
      [
        {
          type: "file",
          url: "/api/files/uploads/user-1/metrics.xlsx",
          filename: "metrics.xlsx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
      async (key) => {
        expect(key).toBe("uploads/user-1/metrics.xlsx");
        return bytes;
      },
      "user-1",
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain("Active users");
    expect(parts[0].text).toContain("123");
  });
});
