import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_HTML_BYTES,
  clearCanvasContentForTests,
  getCanvasContent,
  setCanvasContent,
} from "./content-store";

describe("user-scoped temporary canvas content", () => {
  beforeEach(() => clearCanvasContentForTests());

  it("isolates content by user and canvas and expires it", () => {
    expect(setCanvasContent("user-1", "canvas-1", "<p>one</p>", 100)).toBe(
      true,
    );
    expect(getCanvasContent("user-1", "canvas-1", 101)).toBe("<p>one</p>");
    expect(getCanvasContent("user-2", "canvas-1", 101)).toBeNull();
    expect(getCanvasContent("user-1", "canvas-2", 101)).toBeNull();
    expect(getCanvasContent("user-1", "canvas-1", 30 * 60 * 1000 + 100)).toBe(
      null,
    );
  });

  it("rejects oversize content instead of truncating it", () => {
    expect(
      setCanvasContent("user-1", "canvas-1", "x".repeat(MAX_HTML_BYTES + 1)),
    ).toBe(false);
    expect(getCanvasContent("user-1", "canvas-1")).toBeNull();
  });

  it("measures multibyte HTML by UTF-8 byte size", () => {
    expect(setCanvasContent("user-1", "canvas-1", "é".repeat(300_000))).toBe(
      false,
    );
  });
});
