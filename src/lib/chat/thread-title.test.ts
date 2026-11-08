import { describe, expect, it } from "vitest";
import {
  MAX_THREAD_TITLE_LENGTH,
  deriveThreadTitleFromText,
  normalizeThreadTitle,
} from "./thread-title";

describe("chat thread title safety", () => {
  it("normalizes whitespace and surrounding model quotes", () => {
    expect(normalizeThreadTitle("  “Plan   a trip”\n")).toBe("Plan a trip");
  });

  it("bounds model output and rejects non-string values", () => {
    expect(normalizeThreadTitle("x".repeat(200))).toHaveLength(
      MAX_THREAD_TITLE_LENGTH,
    );
    expect(normalizeThreadTitle({ title: "unsafe" })).toBe("");
  });

  it("uses only the first user prompt as fallback, bounded to the title limit", () => {
    expect(
      deriveThreadTitleFromText(
        `user: ${"question ".repeat(20)}\n\nassistant: private response`,
      ),
    ).toHaveLength(MAX_THREAD_TITLE_LENGTH);
    expect(deriveThreadTitleFromText("assistant: response")).toBe("");
  });
});
