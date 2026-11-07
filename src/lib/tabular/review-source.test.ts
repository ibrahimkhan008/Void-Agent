import { describe, expect, it } from "vitest";
import {
  assemblePinnedReviewSource,
  groupReviewSourceDocuments,
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
