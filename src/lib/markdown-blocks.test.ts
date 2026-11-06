import { describe, expect, it } from "vitest";
import { parseMarkdownIntoBlocks } from "./markdown-blocks";

describe("parseMarkdownIntoBlocks", () => {
  it("splits top-level paragraphs", () => {
    expect(parseMarkdownIntoBlocks("first\n\nsecond")).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps blank-line-separated GFM list items in the same parse block", () => {
    expect(parseMarkdownIntoBlocks("- first\n\n- second")).toEqual([
      "- first\n\n- second",
    ]);
  });

  it("bounds large blank runs while preserving list separation", () => {
    const markdown = `- first${"\n".repeat(50_000)}- second`;
    expect(parseMarkdownIntoBlocks(markdown)).toEqual(["- first\n\n- second"]);
  });

  it("keeps blank lines inside open or closed fenced code blocks", () => {
    expect(
      parseMarkdownIntoBlocks("intro\n\n~~~ts\na\n\nb\n~~~\n\nend"),
    ).toEqual(["intro", "~~~ts\na\n\nb\n~~~", "end"]);
    expect(parseMarkdownIntoBlocks("```ts\na\n\nb")).toEqual(["```ts\na\n\nb"]);
  });

  it("keeps blank lines inside display math", () => {
    expect(parseMarkdownIntoBlocks("$$\nx = 1\n\ny = 2\n$$\n\nnext")).toEqual([
      "$$\nx = 1\n\ny = 2\n$$",
      "next",
    ]);
  });

  it("keeps previously completed block text unchanged as the tail grows", () => {
    const before = parseMarkdownIntoBlocks("first\n\nsecond");
    const after = parseMarkdownIntoBlocks("first\n\nsecond grows");
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(after.at(-1)).toBe("second grows");
  });

  it("returns no blocks for empty input", () => {
    expect(parseMarkdownIntoBlocks("")).toEqual([]);
  });
});
