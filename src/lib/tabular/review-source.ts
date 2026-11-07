export type PinnedReviewSourcePage = {
  documentId: string | null;
  position: number;
  content: string | null;
};

export type ReviewSourceResult =
  | { ok: true; source: string }
  | { ok: false; reason: "missing" | "incomplete" | "empty" };

export function groupReviewSourceDocuments(
  rows: Array<{
    itemId: string;
    documentId: string;
    createdAt: Date;
  }>,
) {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const documents = grouped.get(row.itemId) ?? [];
    documents.push(row);
    grouped.set(row.itemId, documents);
  }
  for (const documents of grouped.values()) {
    documents.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.documentId.localeCompare(b.documentId),
    );
  }
  return grouped;
}

/** Build text only from the exact ordered pages pinned to a review item. */
export function assemblePinnedReviewSource(
  pages: PinnedReviewSourcePage[],
  maxChars: number,
): ReviewSourceResult {
  if (pages.length === 0) return { ok: false, reason: "missing" };
  if (
    pages.some((page) => page.documentId === null || page.content === null) ||
    new Set(pages.map((page) => page.position)).size !== pages.length
  ) {
    return { ok: false, reason: "incomplete" };
  }
  const source = [...pages]
    .sort((a, b) => a.position - b.position)
    .map((page) => page.content ?? "")
    .join("\n\n")
    .slice(0, maxChars);
  return source.trim() ? { ok: true, source } : { ok: false, reason: "empty" };
}
