import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { href: string; children: React.ReactNode }) =>
      createElement("a", { href: props.href }, props.children),
  };
});

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: {
      asChild?: boolean;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => props.children ?? createElement("button", null),
  };
});

import {
  TabularReviewToolCard,
  shouldAutoGenerateReview,
} from "./tabular-review-tool";

describe("TabularReviewToolCard", () => {
  it("starts work only for pending or failed reviews", () => {
    expect(shouldAutoGenerateReview("pending")).toBe(true);
    expect(shouldAutoGenerateReview("error")).toBe(true);
    expect(shouldAutoGenerateReview("generating")).toBe(false);
    expect(shouldAutoGenerateReview("done")).toBe(false);
  });

  it("links the new review into its persistent edit workspace", () => {
    const reviewId = "00000000-0000-4000-8000-000000000001";
    const markup = renderToStaticMarkup(
      <TabularReviewToolCard
        part={
          {
            state: "output-available",
            input: {
              title: "Compare contracts",
              itemIds: ["item"],
              columns: [{ id: "dates", label: "Key dates" }],
            },
            output: {
              id: reviewId,
              title: "Compare contracts",
              documentCount: 1,
              columnCount: 1,
            },
          } as never
        }
      />,
    );

    expect(markup).toContain("Review &amp; edit");
    expect(markup).toContain(
      "/tabular-reviews/00000000-0000-4000-8000-000000000001",
    );
    expect(markup).not.toContain("/export");
  });
});
