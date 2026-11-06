import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  downloadDefaultPath,
  safeDownloadUrlLabel,
  sanitizeDownloadFilename,
} from "./download-paths.js";

describe("desktop download paths", () => {
  it("normalizes unsafe filenames to a single safe basename", () => {
    expect(sanitizeDownloadFilename("../../report.xlsx")).toBe("report.xlsx");
    expect(sanitizeDownloadFilename("C:\\private\\<report>.xlsx")).toBe(
      "_report_.xlsx",
    );
    expect(sanitizeDownloadFilename("...   ")).toBe("download");
  });

  it("keeps the save path inside the downloads directory", () => {
    expect(
      downloadDefaultPath("/home/user/Downloads", "../../report.xlsx"),
    ).toBe(path.join("/home/user/Downloads", "report.xlsx"));
  });

  it("omits credentials, query strings, and fragments from download logs", () => {
    expect(
      safeDownloadUrlLabel(
        "https://user:password@example.test/export?token=secret#private",
      ),
    ).toBe("https://example.test/export");
    expect(safeDownloadUrlLabel("invalid")).toBe("(invalid URL)");
  });
});
