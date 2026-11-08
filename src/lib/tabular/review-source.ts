import {
  numberDocumentPassageSpans,
  validateCitationAnswer,
} from "./review-schema";

export type PinnedReviewSourcePage = {
  documentId: string | null;
  position: number;
  content: string | null;
};

export type ReviewSourceResult =
  | { ok: true; source: string }
  | { ok: false; reason: "missing" | "incomplete" | "empty" };

export type ReviewCitationEvidence = {
  answer: string;
  citations: Array<{
    passageNumber: number;
    quote: string;
    /** One-based display positions within the ordered pinned source set. */
    sourcePositions: number[];
  }>;
};

export function formatReviewCitationEvidenceForExport(
  evidence: ReviewCitationEvidence,
) {
  const details = evidence.citations.map((citation) => {
    const positions = citation.sourcePositions.length
      ? citation.sourcePositions
          .map((position) => `source segment ${position}`)
          .join(", ")
      : "source position unavailable";
    return `[${citation.passageNumber}] ${positions}: “${citation.quote}”`;
  });
  return [evidence.answer, "Evidence:", ...details].join("\n");
}

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

/**
 * Validate a stored citation answer against the immutable pinned source set,
 * then resolve each exact quote to the ordered source segments it occurs in.
 * Positions are one-based labels for TabularReviewSourceDocument.position;
 * they are not claims about original PDF page numbers.
 */
export function resolvePinnedReviewCitationEvidence(
  answer: string,
  pages: PinnedReviewSourcePage[],
  maxChars: number,
): ReviewCitationEvidence | null {
  const assembled = assemblePinnedReviewSource(pages, maxChars);
  if (!assembled.ok) return null;
  const verified = validateCitationAnswer(answer, assembled.source);
  if (!verified.ok) return null;

  const orderedPages = [...pages].sort((a, b) => a.position - b.position);
  const sourceSegments: Array<{
    position: number;
    start: number;
    end: number;
  }> = [];
  let offset = 0;
  for (const [index, page] of orderedPages.entries()) {
    if (index > 0) offset += 2;
    const content = page.content ?? "";
    const start = offset;
    const end = Math.min(start + content.length, assembled.source.length);
    if (start < assembled.source.length && end > start) {
      sourceSegments.push({ position: page.position + 1, start, end });
    }
    offset += content.length;
  }

  const passageSpans = numberDocumentPassageSpans(assembled.source);
  const citations = verified.citations.map((citation) => {
    const passage = passageSpans[citation.passageNumber - 1];
    if (!passage) return { ...citation, sourcePositions: [] };

    const sourcePositions = new Set<number>();
    let searchFrom = 0;
    while (searchFrom <= passage.text.length - citation.quote.length) {
      const quoteOffset = passage.text.indexOf(citation.quote, searchFrom);
      if (quoteOffset < 0) break;
      const quoteStart = passage.start + quoteOffset;
      const quoteEnd = quoteStart + citation.quote.length;
      for (const segment of sourceSegments) {
        if (quoteStart < segment.end && quoteEnd > segment.start) {
          sourcePositions.add(segment.position);
        }
      }
      searchFrom = quoteOffset + 1;
    }
    return {
      ...citation,
      sourcePositions: [...sourcePositions].sort((a, b) => a - b),
    };
  });

  return {
    answer: verified.answer,
    citations,
  };
}
