import { describe, expect, it } from "vitest";
import {
  assemblePinnedReviewSource,
  formatReviewCitationEvidenceForExport,
  groupReviewSourceDocuments,
  resolvePinnedReviewCitationEvidence,
} from "./review-source";

describe("groupReviewSourceDocuments", () => {
  it("orders every page deterministically by creation time and ID", () => {
    const timestamp = new Date("2026-11-07T00:00:00Z");
    const grouped = groupReviewSourceDocuments([
      { itemId: "item-1", documentId: "page-z", createdAt: timestamp },
      {
        itemId: "item-2",
        documentId: "other-item",
        createdAt: new Date("2026-11-06T00:00:00Z"),
      },
      { itemId: "item-1", documentId: "page-a", createdAt: timestamp },
      {
        itemId: "item-1",
        documentId: "older",
        createdAt: new Date("2026-11-06T00:00:00Z"),
      },
    ]);
    expect(grouped.get("item-1")?.map((row) => row.documentId)).toEqual([
      "older",
      "page-a",
      "page-z",
    ]);
    expect(grouped.get("item-2")?.map((row) => row.documentId)).toEqual([
      "other-item",
    ]);
  });
});

describe("assemblePinnedReviewSource", () => {
  it("uses the full pinned page set in stable order and ignores unpinned pages", () => {
    const result = assemblePinnedReviewSource(
      [
        { documentId: "page-b", position: 1, content: "Second page" },
        { documentId: "page-a", position: 0, content: "First page" },
      ],
      100,
    );
    expect(result).toEqual({
      ok: true,
      source: "First page\n\nSecond page",
    });
  });

  it("does not use partial text if a pinned page has been deleted", () => {
    expect(
      assemblePinnedReviewSource(
        [
          { documentId: "page-a", position: 0, content: "First page" },
          { documentId: null, position: 1, content: null },
        ],
        100,
      ),
    ).toEqual({ ok: false, reason: "incomplete" });
  });

  it("fails closed when the review has no pinned sources or extracted text", () => {
    expect(assemblePinnedReviewSource([], 100)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(
      assemblePinnedReviewSource(
        [{ documentId: "page-a", position: 0, content: "  " }],
        100,
      ),
    ).toEqual({ ok: false, reason: "empty" });
  });

  it("bounds assembled source size", () => {
    expect(
      assemblePinnedReviewSource(
        [{ documentId: "page-a", position: 0, content: "0123456789" }],
        5,
      ),
    ).toEqual({ ok: true, source: "01234" });
  });
});

describe("resolvePinnedReviewCitationEvidence", () => {
  it("maps verified quotes to ordered source segments, not supposed PDF pages", () => {
    const result = resolvePinnedReviewCitationEvidence(
      "Renewal is annual [1].\n<CITATIONS>\n[1]: The agreement renews annually.\n</CITATIONS>",
      [
        {
          documentId: "second",
          position: 1,
          content: "The agreement renews annually.",
        },
        {
          documentId: "first",
          position: 0,
          content: "The contract starts today.",
        },
      ],
      1_000,
    );

    expect(result).toEqual({
      answer: "Renewal is annual [1].",
      citations: [
        {
          passageNumber: 1,
          quote: "The agreement renews annually.",
          sourcePositions: [2],
        },
      ],
    });
  });

  it("shows every pinned segment when the exact quote occurs in multiple sources", () => {
    const result = resolvePinnedReviewCitationEvidence(
      "It says this [1].\n<CITATIONS>\n[1]: Same exact sentence.\n</CITATIONS>",
      [
        { documentId: "a", position: 0, content: "Same exact sentence." },
        { documentId: "b", position: 1, content: "Same exact sentence." },
      ],
      1_000,
    );

    expect(result?.citations[0]?.sourcePositions).toEqual([1, 2]);
  });

  it("does not claim source positions for unverifiable citations or truncated text", () => {
    const pages = [
      { documentId: "a", position: 0, content: "A verified quote." },
      { documentId: "b", position: 1, content: "A later quote." },
    ];
    expect(
      resolvePinnedReviewCitationEvidence(
        "Claim [1].\n<CITATIONS>\n[1]: fabricated\n</CITATIONS>",
        pages,
        1_000,
      ),
    ).toBeNull();
    expect(
      resolvePinnedReviewCitationEvidence(
        "Claim [1].\n<CITATIONS>\n[1]: A later quote.\n</CITATIONS>",
        pages,
        20,
      ),
    ).toBeNull();
  });

  it("formats verified citation evidence for a spreadsheet cell", () => {
    expect(
      formatReviewCitationEvidenceForExport({
        answer: "Renewal is annual [1].",
        citations: [
          {
            passageNumber: 1,
            quote: "The agreement renews annually.",
            sourcePositions: [2],
          },
        ],
      }),
    ).toBe(
      "Renewal is annual [1].\nEvidence:\n[1] source segment 2: “The agreement renews annually.”",
    );
  });
});
