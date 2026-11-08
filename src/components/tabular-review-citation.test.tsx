import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabularReviewCitation } from "./tabular-review-citation";

describe("TabularReviewCitation", () => {
  it("renders the verified answer, exact quote, and accurate source segment label", () => {
    const markup = renderToStaticMarkup(
      <TabularReviewCitation
        evidence={{
          answer: "The agreement renews annually [1].",
          citations: [
            {
              passageNumber: 1,
              quote: "The agreement renews annually.",
              sourcePositions: [2],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("The agreement renews annually [1].");
    expect(markup).toContain("Source segment 2");
    expect(markup).toContain("The agreement renews annually.");
    expect(markup).not.toContain("&lt;CITATIONS&gt;");
  });

  it("does not invent a source position when a pinned source cannot be resolved", () => {
    const markup = renderToStaticMarkup(
      <TabularReviewCitation
        evidence={{
          answer: "The agreement renews annually [1].",
          citations: [
            {
              passageNumber: 1,
              quote: "The agreement renews annually.",
              sourcePositions: [],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Source position unavailable");
  });
});
