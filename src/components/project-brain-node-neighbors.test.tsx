// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, props.children),
  };
});

import { ProjectBrainNodeNeighbors } from "./project-brain-node-neighbors";

afterEach(cleanup);

describe("ProjectBrainNodeNeighbors", () => {
  it("opens the selected neighbor's existing source-scoped detail", () => {
    const onSelect = vi.fn();
    render(
      <ProjectBrainNodeNeighbors
        neighbors={[{ id: "northstar-page", label: "Northstar", factCount: 4 }]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open details for Northstar" }),
    );
    expect(onSelect).toHaveBeenCalledWith("northstar-page");
  });

  it("does not render a related section when there are no visible neighbors", () => {
    render(<ProjectBrainNodeNeighbors neighbors={[]} onSelect={vi.fn()} />);
    expect(
      screen.queryByRole("region", { name: "Related entities" }),
    ).toBeNull();
  });
});
