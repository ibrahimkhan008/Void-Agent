import type { SavedNote, SavedNoteCitation } from "app-types/user";

export const MAX_SAVED_NOTES = 100;
export const MAX_NOTE_TITLE_LENGTH = 160;
export const MAX_NOTE_MARKDOWN_LENGTH = 50_000;
export const MAX_NOTE_CITATIONS = 50;
export const MAX_NOTE_CITATION_URL_LENGTH = 2_048;

function safeHttpUrl(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > MAX_NOTE_CITATION_URL_LENGTH
  ) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeNoteCitations(value: unknown): SavedNoteCitation[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_NOTE_CITATIONS).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const citation = entry as Partial<SavedNoteCitation>;
    const url = safeHttpUrl(citation.url);
    if (!url) return [];

    const title =
      typeof citation.title === "string"
        ? citation.title.trim().slice(0, 500)
        : "";
    const id =
      typeof citation.id === "number" &&
      Number.isSafeInteger(citation.id) &&
      citation.id > 0
        ? citation.id
        : index + 1;

    return [{ id, title: title || url, url }];
  });
}

export function normalizeSavedNotes(value: unknown): SavedNote[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_SAVED_NOTES)
    .flatMap((entry): SavedNote[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return [];
      const note = entry as Partial<SavedNote>;
      const id =
        typeof note.id === "string" ? note.id.trim().slice(0, 100) : "";
      const title =
        typeof note.title === "string"
          ? note.title.trim().slice(0, MAX_NOTE_TITLE_LENGTH)
          : "";
      const markdown =
        typeof note.markdown === "string"
          ? note.markdown.trim().slice(0, MAX_NOTE_MARKDOWN_LENGTH)
          : "";
      if (!id || !title || !markdown) return [];

      const createdAt =
        typeof note.createdAt === "string" &&
        Number.isFinite(Date.parse(note.createdAt))
          ? new Date(note.createdAt).toISOString()
          : new Date(0).toISOString();
      const updatedAt =
        typeof note.updatedAt === "string" &&
        Number.isFinite(Date.parse(note.updatedAt))
          ? new Date(note.updatedAt).toISOString()
          : createdAt;

      return [
        {
          id,
          title,
          markdown,
          createdAt,
          updatedAt,
          citations: sanitizeNoteCitations(note.citations),
        },
      ];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getNoteTitleFromMarkdown(markdown: string): string {
  const firstLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Saved Note";
  return firstLine.replace(/^#{1,6}\s*/, "").slice(0, 120) || "Saved Note";
}

export function buildSavedNoteMarkdown({
  title,
  markdownBody,
  citations,
  savedAt = new Date(),
}: {
  title: string;
  markdownBody: string;
  citations: SavedNoteCitation[];
  savedAt?: Date;
}): string {
  const sourceSection = citations.length
    ? [
        "## Sources",
        ...citations.map(
          (citation, index) =>
            `${index + 1}. [${citation.title || citation.url}](${citation.url})`,
        ),
      ].join("\n")
    : "";

  return [
    `# ${title.trim() || getNoteTitleFromMarkdown(markdownBody)}`,
    "",
    `Saved from Void Agent on ${savedAt.toISOString()}`,
    "",
    markdownBody.trim(),
    sourceSection ? `\n${sourceSection}` : "",
    "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

export function sanitizeNoteFileName(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_NOTE_TITLE_LENGTH) || "saved-note"
  );
}

export function downloadMarkdownFile({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeNoteFileName(title)}.md`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
