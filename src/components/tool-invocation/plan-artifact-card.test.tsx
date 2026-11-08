/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanArtifactCard } from "./plan-artifact-card";

describe("PlanArtifactCard", () => {
  afterEach(() => cleanup());

  it("renders bounded structured plan content as a non-executing artifact", () => {
    render(
      <PlanArtifactCard
        part={
          {
            type: "dynamic-tool",
            toolName: "createPlan",
            toolCallId: "call-1",
            state: "output-available",
            input: {
              title: "Launch plan",
              description: "A short outline",
              steps: [
                { title: "Research", description: "Review requirements" },
                { title: "Build", description: "Implement the agreed scope" },
              ],
              ignored: "not rendered",
            },
            output: { status: "plan_created" },
          } as never
        }
      />,
    );

    expect(screen.getByText("Launch plan")).toBeTruthy();
    expect(screen.getByText("Review requirements")).toBeTruthy();
    expect(screen.getByText("Plan ready · no actions executed")).toBeTruthy();
    expect(screen.queryByText("not rendered")).toBeNull();
  });
});
