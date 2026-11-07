/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import {
  type ProjectBrainPageDetail,
  ProjectBrainPageDetailPanel,
} from "./project-brain-page-detail";

const detail: ProjectBrainPageDetail = {
  page: {
    id: "page-1",
    title: "Northstar",
    entityType: "project",
    normalizedTitle: "northstar",
    salience: 1.2,
    updatedAt: "2026-11-07T09:00:00.000Z",
  },
  aliases: ["North Star"],
  mergedFrom: [
    { title: "North Star Project", mergedAt: "2026-11-06T09:00:00.000Z" },
  ],
  links: [
    {
      pageId: "page-2",
      title: "Riya",
      type: "owner",
      confidence: 0.9,
    },
  ],
  backlinks: [
    {
      pageId: "page-3",
      title: "Atlas",
      type: "depends on",
      confidence: 0.8,
    },
  ],
  facts: [
    {
      id: "fact-1",
      subject: "Northstar",
      predicate: "owner",
      object: "Riya",
      evidence: "Riya leads Northstar.",
      confidence: 0.9,
      reviewStatus: "proposed",
      sourceVersionId: "revision-1",
      sourceVersionCreatedAt: "2026-11-07T09:00:00.000Z",
      sourceSnapshotAvailable: true,
      filename: "plan.md",
      sourceUrl: null,
    },
  ],
};

afterEach(() => cleanup());

describe("ProjectBrainPageDetailPanel", () => {
  it("shows typed page detail, preserved review state, and exact revision actions", () => {
    const onToggleRevision = vi.fn();
    const onReviewFact = vi.fn();
    render(
      <ProjectBrainPageDetailPanel
        detail={detail}
        loading={false}
        error={false}
        canReview
        revisionPreview={null}
        loadingRevisionId={null}
        onToggleRevision={onToggleRevision}
        onReviewFact={onReviewFact}
      />,
    );

    expect(screen.getAllByText("Northstar")).toHaveLength(2);
    expect(screen.getByText("Accepted aliases: North Star")).toBeTruthy();
    expect(screen.getByText("Merged identities")).toBeTruthy();
    expect(screen.getByText(/North Star Project/)).toBeTruthy();
    expect(screen.getByText("Links")).toBeTruthy();
    expect(screen.getByText("Backlinks")).toBeTruthy();
    expect(screen.getByText("Riya")).toBeTruthy();
    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.getByText("proposed")).toBeTruthy();
    expect(screen.getByText("Riya leads Northstar.")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "View exact source revision" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept claim" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject claim" }));

    expect(onToggleRevision).toHaveBeenCalledWith("revision-1");
    expect(onReviewFact).toHaveBeenNthCalledWith(1, "fact-1", "accepted");
    expect(onReviewFact).toHaveBeenNthCalledWith(2, "fact-1", "rejected");
  });

  it("keeps review controls owner/editor-only and handles missing revision snapshots", () => {
    render(
      <ProjectBrainPageDetailPanel
        detail={{
          ...detail,
          facts: [{ ...detail.facts[0]!, sourceSnapshotAvailable: false }],
        }}
        loading={false}
        error={false}
        canReview={false}
        revisionPreview={null}
        loadingRevisionId={null}
        onToggleRevision={vi.fn()}
        onReviewFact={vi.fn()}
      />,
    );

    expect(screen.getByText("Revision snapshot unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept claim" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject claim" })).toBeNull();
  });

  it("shows loading, error, and stale-source states", () => {
    const { rerender } = render(
      <ProjectBrainPageDetailPanel
        detail={null}
        loading
        error={false}
        canReview={false}
        revisionPreview={null}
        loadingRevisionId={null}
        onToggleRevision={vi.fn()}
        onReviewFact={vi.fn()}
      />,
    );
    expect(screen.getByText(/Loading current entity evidence/)).toBeTruthy();

    rerender(
      <ProjectBrainPageDetailPanel
        detail={null}
        loading={false}
        error
        canReview={false}
        revisionPreview={null}
        loadingRevisionId={null}
        onToggleRevision={vi.fn()}
        onReviewFact={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <ProjectBrainPageDetailPanel
        detail={null}
        loading={false}
        error={false}
        canReview={false}
        revisionPreview={null}
        loadingRevisionId={null}
        onToggleRevision={vi.fn()}
        onReviewFact={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no longer backed by an accepted claim/),
    ).toBeTruthy();
  });
});
