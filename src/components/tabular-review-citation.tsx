import type { ReviewCitationEvidence } from "lib/tabular/review-source";
import React from "react";

export function TabularReviewCitation({
  evidence,
}: {
  evidence: ReviewCitationEvidence;
}) {
  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap text-foreground">
        {evidence.answer}
      </div>
      <div className="space-y-1 border-l-2 pl-2 text-xs text-muted-foreground">
        {evidence.citations.map((citation) => (
          <div key={`${citation.passageNumber}:${citation.quote}`}>
            <span className="font-medium">[{citation.passageNumber}]</span>{" "}
            {citation.sourcePositions.length ? (
              <span>
                Source segment{citation.sourcePositions.length === 1 ? "" : "s"}{" "}
                {citation.sourcePositions.join(", ")}
              </span>
            ) : (
              <span>Source position unavailable</span>
            )}
            <blockquote className="mt-0.5 whitespace-pre-wrap">
              “{citation.quote}”
            </blockquote>
          </div>
        ))}
      </div>
    </div>
  );
}
