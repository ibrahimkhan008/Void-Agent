import { describe, expect, it } from "vitest";
import { getAttachmentPreviewIdentity } from "./attachment-preview";

describe("getAttachmentPreviewIdentity", () => {
  it("uses the explicit attachment title", () => {
    expect(
      getAttachmentPreviewIdentity("report.docx", "/uploads/u/id.bin"),
    ).toEqual({
      name: "report.docx",
      extension: "DOCX",
    });
  });

  it("infers the extension from a decoded URL path without query or hash", () => {
    expect(
      getAttachmentPreviewIdentity(
        undefined,
        "https://storage.test/path/quarter%20notes.md?sig=1#top",
      ),
    ).toEqual({ name: "quarter notes.md", extension: "MD" });
  });

  it("returns a safe fallback for URLs without a filename", () => {
    expect(
      getAttachmentPreviewIdentity(undefined, "https://storage.test/?sig=1"),
    ).toEqual({
      name: "attachment",
      extension: "FILE",
    });
  });
});
