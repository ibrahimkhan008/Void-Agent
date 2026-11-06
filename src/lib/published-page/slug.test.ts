import { describe, expect, it } from "vitest";
import { buildPageSlug, isValidPageSlug } from "./slug";

describe("published page slugs", () => {
  it("creates readable capability URLs with independent 96-bit suffixes", () => {
    const first = buildPageSlug("Störyboard Launch");
    const second = buildPageSlug("Störyboard Launch");
    expect(first.startsWith("storyboard-launch-")).toBe(true);
    expect(isValidPageSlug(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("falls back to a safe prefix and rejects malformed paths", () => {
    expect(buildPageSlug("***").startsWith("page-")).toBe(true);
    expect(isValidPageSlug("../private")).toBe(false);
    expect(isValidPageSlug(`page-${"a".repeat(23)}`)).toBe(false);
  });
});
