import { describe, expect, test } from "vitest";
import { buildReviewColumns } from "./review-columns";

describe("buildReviewColumns", () => {
  test("preserves selected preset definitions and emits typed custom columns", () => {
    const columns = buildReviewColumns(
      [
        {
          id: "summary",
          label: "Summary",
          type: "text",
          prompt: "Summarize the source.",
          preset: "summary",
        },
      ],
      [
        {
          label: "Renewal date",
          type: "date",
          prompt: "When does the agreement renew?",
        },
        {
          label: "Evidence",
          type: "citation",
          prompt: "What clause supports the answer?",
        },
      ],
    );

    expect(columns).toEqual([
      {
        id: "summary",
        label: "Summary",
        type: "text",
        prompt: "Summarize the source.",
        preset: "summary",
      },
      {
        id: "custom_1",
        label: "Renewal date",
        type: "date",
        prompt: "When does the agreement renew?",
      },
      {
        id: "custom_2",
        label: "Evidence",
        type: "citation",
        prompt: "What clause supports the answer?",
      },
    ]);
  });

  test("rejects empty or incomplete columns and more than the API maximum", () => {
    expect(buildReviewColumns([], [])).toBeNull();
    expect(
      buildReviewColumns([], [{ label: "", type: "text", prompt: "Question" }]),
    ).toBeNull();
    expect(
      buildReviewColumns(
        Array.from({ length: 8 }, (_, index) => ({
          id: `field_${index}`,
          label: `Field ${index}`,
          type: "text" as const,
          prompt: "Read source.",
        })),
        [{ label: "Extra", type: "text", prompt: "Read source." }],
      ),
    ).toBeNull();
  });
});
