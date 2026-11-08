// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectBrainClaimEvidence } from "./project-brain-claim-evidence";

afterEach(cleanup);

describe("ProjectBrainClaimEvidence", () => {
  it("shows the exact source label, observation time, and evidence text", () => {
    render(
      <ProjectBrainClaimEvidence
        label="First claim"
        filename="release-plan.md"
        factCapturedAt="2026-11-01T10:00:00.000Z"
        evidence="The release is ready."
      />,
    );

    expect(screen.getByText("First claim: release-plan.md")).toBeTruthy();
    expect(screen.getByText("The release is ready.")).toBeTruthy();
    expect(screen.getByText("Fact captured", { exact: false }).tagName).toBe(
      "P",
    );
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(
      screen.getByText(/2026/).closest("time")?.getAttribute("datetime"),
    ).toBe("2026-11-01T10:00:00.000Z");
  });

  it("does not render a broken date when the timestamp is invalid", () => {
    render(
      <ProjectBrainClaimEvidence
        label="Second claim"
        evidence="The release is blocked."
        factCapturedAt="invalid"
      />,
    );

    expect(screen.getByText("Second claim: Source document")).toBeTruthy();
    expect(screen.queryByText(/Fact captured/)).toBeNull();
  });
});
