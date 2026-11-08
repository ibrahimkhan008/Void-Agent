/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { ProjectDocumentEditProposal } from "./project-document-edit-proposal";

describe("ProjectDocumentEditProposal", () => {
  afterEach(() => cleanup());

  it("shows the proposal and links to the existing explicit review panel", () => {
    render(
      <ProjectDocumentEditProposal
        loading={false}
        result={{
          status: "pending_review",
          filename: "draft.docx",
          changes: [
            {
              originalText: "Old text",
              suggestedText: "New text",
              rationale: "Clarifies the sentence.",
            },
          ],
          message: "No source changes were applied.",
        }}
      />,
    );

    expect(screen.getByText("DOCX proposal awaiting review")).toBeTruthy();
    expect(screen.getByText("Old text")).toBeTruthy();
    expect(screen.getByText("New text")).toBeTruthy();
    expect(screen.getByText(/No source changes were applied/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open project documents" })
        .getAttribute("href"),
    ).toBe("/projects");
    expect(screen.queryByRole("button", { name: /accept|reject/i })).toBeNull();
  });

  it("shows errors without presenting a review action", () => {
    render(
      <ProjectDocumentEditProposal
        loading={false}
        result={{
          error: "The source document changed; no proposal was created.",
        }}
      />,
    );
    expect(screen.getByText(/source document changed/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
