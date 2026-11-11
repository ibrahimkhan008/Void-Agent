import { describe, expect, it } from "vitest";
import {
  buildSavedNoteMarkdown,
  getNoteTitleFromMarkdown,
  normalizeSavedNotes,
  sanitizeNoteCitations,
  sanitizeNoteFileName,
} from "./notes";

describe("saved notes helpers", () => {
  it("derives a bounded title from the first markdown heading", () => {
    expect(getNoteTitleFromMarkdown("\n## Useful answer\n\nDetails")).toBe(
      "Useful answer",
    );
    expect(getNoteTitleFromMarkdown("plain body")).toBe("plain body");
    expect(getNoteTitleFromMarkdown("### ")).toBe("Saved Note");
  });

  it("limits normalized note fields and orders newest first", () => {
    const notes = normalizeSavedNotes([
      {
        id: "old",
        title: "Old",
        markdown: "old body",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      {
        id: "new",
        title: "New",
        markdown: "new body",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
    ]);

    expect(notes.map(({ id }) => id)).toEqual(["new", "old"]);
    expect(notes[0].citations).toEqual([]);
    expect(notes[1].updatedAt).toBe(notes[1].createdAt);
  });

  it("drops unsafe and credentialed citation URLs", () => {
    expect(
      sanitizeNoteCitations([
        { id: 1, title: "Safe", url: "https://docs.example/page" },
        { id: 2, title: "Script", url: "javascript:alert(1)" },
        { id: 3, title: "Credentials", url: "https://user:pass@example.com" },
      ]),
    ).toEqual([{ id: 1, title: "Safe", url: "https://docs.example/page" }]);
  });

  it("exports markdown with citations and a sanitized filename", () => {
    const markdown = buildSavedNoteMarkdown({
      title: "Answer",
      markdownBody: "Useful response",
      citations: [
        { id: 1, title: "Reference", url: "https://example.com/source" },
      ],
      savedAt: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(markdown).toContain("Saved from Void-Agent on 2026-01-02");
    expect(markdown).toContain("[Reference](https://example.com/source)");
    expect(sanitizeNoteFileName('a/b:"c"')).toBe("a b c");
  });
});
