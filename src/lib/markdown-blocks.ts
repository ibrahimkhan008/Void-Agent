// CommonMark fenced code blocks may use backticks or tildes, with up to three
// leading spaces. Keep the opener so appended tokens cannot change its prefix.
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const LIST_ITEM_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/;

/**
 * Split markdown at top-level blank lines while preserving blank lines inside
 * fenced code and display-math blocks. All blocks before the final block are
 * byte-stable as a response streams, so React can skip parsing them again.
 */
export function parseMarkdownIntoBlocks(markdown: string): string[] {
  if (!markdown) return [];

  const blocks: string[] = [];
  let lines: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  let inDisplayMath = false;
  let hasPendingBlankLine = false;
  let startsWithList = false;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();

    if (fence) {
      const closingFence = FENCE_RE.exec(line);
      if (
        closingFence &&
        closingFence[2][0] === fence.marker &&
        closingFence[2].length >= fence.length &&
        closingFence[3].trim() === ""
      ) {
        fence = null;
      }
      lines.push(line);
      continue;
    }

    if (inDisplayMath) {
      if (trimmed === "$$") inDisplayMath = false;
      lines.push(line);
      continue;
    }

    if (trimmed !== "" && hasPendingBlankLine) {
      const continuesList =
        startsWithList && (LIST_ITEM_RE.test(line) || /^ {2,}/.test(line));
      if (continuesList) {
        // One blank separator preserves loose-list semantics. Collapse longer
        // runs so retained whitespace is bounded regardless of input size.
        lines.push("");
      } else if (lines.length) {
        blocks.push(lines.join("\n"));
        lines = [];
        startsWithList = false;
      }
      hasPendingBlankLine = false;
    }

    if (trimmed === "$$") {
      inDisplayMath = true;
      lines.push(line);
      continue;
    }

    const openingFence = FENCE_RE.exec(line);
    if (openingFence) {
      fence = {
        marker: openingFence[2][0],
        length: openingFence[2].length,
      };
      if (lines.length === 0) startsWithList = false;
      lines.push(line);
      continue;
    }

    if (trimmed === "") {
      if (lines.length) hasPendingBlankLine = true;
      continue;
    }

    if (lines.length === 0) startsWithList = LIST_ITEM_RE.test(line);
    lines.push(line);
  }

  if (lines.length) blocks.push(lines.join("\n"));
  return blocks;
}
