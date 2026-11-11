import { describe, expect, it } from "vitest";
import {
  buildSandboxedCanvasHtml,
  canvasExportJsonBytes,
  sanitizeCanvasExportFilename,
} from "./export-safety";

describe("eCanvas public export safety", () => {
  it("inserts the restrictive CSP after a doctype and before user HTML", () => {
    const result = buildSandboxedCanvasHtml(
      "<!doctype html><html><body><script>run()</script></body></html>",
    );
    expect(result.indexOf("<!doctype html>")).toBeLessThan(
      result.indexOf("Content-Security-Policy"),
    );
    expect(result.indexOf("Content-Security-Policy")).toBeLessThan(
      result.indexOf("<html>"),
    );
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("form-action 'none'");
  });

  it("sanitizes filenames without allowing header injection or path separators", () => {
    expect(sanitizeCanvasExportFilename("../../Hello\r\nWorld?.html")).toBe(
      "hello-worldhtml",
    );
    expect(sanitizeCanvasExportFilename("💥")).toBe("canvas-export");
  });

  it("measures serialized scene bytes in UTF-8", () => {
    expect(canvasExportJsonBytes({ text: "é" })).toBe(
      new TextEncoder().encode('{"text":"é"}').byteLength,
    );
  });
});
