/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

import { ProjectAssignedWorkflows } from "./project-assigned-workflows";

describe("ProjectAssignedWorkflows", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads project-scoped options, attaches config, and does not execute it", async () => {
    const data = {
      workflows: [],
      availableWorkflows: [
        {
          id: "workflow-1",
          name: "Release review",
          description: "Review release notes",
          icon: null,
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(
        Response.json(
          { assignment: { id: "assignment-1", workflowId: "workflow-1" } },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          workflows: [
            {
              ...data.availableWorkflows[0],
              workflowId: "workflow-1",
              status: "active",
            },
          ],
          availableWorkflows: data.availableWorkflows,
        }),
      );

    render(<ProjectAssignedWorkflows projectId="project-1" />);

    expect(await screen.findByText("Release review")).toBeTruthy();
    expect(screen.getByText(/Assignment does not run a workflow/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/projects/project-1/workflows",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/projects/project-1/workflows",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ workflowId: "workflow-1" }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain("/execute");
    expect(await screen.findByRole("button", { name: "Remove" })).toBeTruthy();
  });
});
