import { describe, expect, it } from "vitest";
import {
  isReviewCellInScope,
  readBoundedJson,
  reviewCellRegenerationSchema,
  reviewCellUpdateSchema,
  reviewGenerationRequestSchema,
} from "./review-cell-schema";

const itemId = "b8f4eb38-02c2-4e5d-9f34-59af27caef34";

describe("tabular review cell schemas", () => {
  it("accepts bounded cell edits and rejects oversized values", () => {
    expect(
      reviewCellUpdateSchema.safeParse({
        itemId,
        columnId: "summary",
        value: "Edited",
      }).success,
    ).toBe(true);
    expect(
      reviewCellUpdateSchema.safeParse({
        itemId,
        columnId: "summary",
        value: "x".repeat(4_001),
      }).success,
    ).toBe(false);
    expect(
      reviewCellUpdateSchema.safeParse({
        itemId: "not-a-uuid",
        columnId: "summary",
        value: "x",
      }).success,
    ).toBe(false);
  });

  it("accepts only a valid regeneration target and checks membership", () => {
    const target = reviewCellRegenerationSchema.parse({
      itemId,
      columnId: "summary",
    });
    expect(isReviewCellInScope([{ itemId, columnId: "summary" }], target)).toBe(
      true,
    );
    expect(isReviewCellInScope([{ itemId, columnId: "other" }], target)).toBe(
      false,
    );
  });

  it("accepts an explicit full-review regeneration request only", () => {
    expect(
      reviewGenerationRequestSchema.safeParse({ force: true }).success,
    ).toBe(true);
    expect(
      reviewGenerationRequestSchema.safeParse({ force: false }).success,
    ).toBe(false);
    expect(
      reviewGenerationRequestSchema.safeParse({ force: "true" }).success,
    ).toBe(false);
    expect(
      reviewGenerationRequestSchema.safeParse({ force: true, itemId }).success,
    ).toBe(false);
  });

  it("bounds and parses incoming JSON bodies", async () => {
    const valid = await readBoundedJson(
      new Request("https://local.test", {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
    );
    expect(valid).toMatchObject({ ok: true, value: { itemId } });
    const oversized = await readBoundedJson(
      new Request("https://local.test", {
        method: "POST",
        body: "x".repeat(20),
      }),
      10,
    );
    expect(oversized).toEqual({ ok: false, reason: "too-large" });
    const invalid = await readBoundedJson(
      new Request("https://local.test", { method: "POST", body: "{" }),
    );
    expect(invalid).toEqual({ ok: false, reason: "invalid-json" });
  });
});
