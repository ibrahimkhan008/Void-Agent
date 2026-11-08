import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  history: { executions: [] as any[] },
  mutate: vi.fn(async () => undefined),
}));

vi.mock("swr", () => ({
  default: () => ({
    data: mocks.history,
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
}));
vi.mock("ui/card", async () => {
  const ReactModule = await import("react");
  const box =
    (tag: string) =>
    ({
      children,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactModule.createElement(tag, props, children);
  return {
    Card: box("div"),
    CardContent: box("div"),
    CardHeader: box("header"),
    CardTitle: box("h2"),
  };
});
vi.mock("ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({
      children,
      size: _size,
      variant: _variant,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactModule.createElement("button", props, children),
  };
});

import { WorkflowExecutionHistory } from "./workflow-execution-history";

const executionId = "0d3e9e33-fc3d-4a63-b497-1662b8ba8ce8";
const review = {
  id: executionId,
  workflowId: "workflow-1",
  workflowName: "Invoice flow",
  status: "awaiting_approval",
  completedNodeCount: 2,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expired: false,
  pendingEffect: {
    nodeId: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
    kind: "http" as const,
    target: "https://example.test/action",
    payload: { credential: "[redacted]", operation: "create invoice" },
    hash: "a".repeat(64),
  },
  canApprove: true,
  canReject: true,
};

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("WorkflowExecutionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history = {
      executions: [
        {
          id: executionId,
          workflowId: "workflow-1",
          workflowName: "Invoice flow",
          status: "awaiting_approval",
          completedNodeCount: 2,
          expiresAt: review.expiresAt,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          expired: false,
        },
      ],
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads an owner-visible pending action and resumes it only with the reviewed hash", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ execution: review }))
      .mockResolvedValueOnce(json({ status: "success" }))
      .mockResolvedValueOnce(
        json({
          execution: { ...review, status: "completed", pendingEffect: null },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkflowExecutionHistory />);
    fireEvent.click(screen.getByRole("button", { name: "Review action" }));
    expect(
      await screen.findByText("Review exact workflow action"),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", {
        name: "Selected workflow execution details",
      }).textContent,
    ).toContain("[redacted]");
    fireEvent.click(screen.getByRole("button", { name: "Approve and resume" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/workflow/executions/${executionId}/decision`,
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      decision: "approve",
      effectHash: "a".repeat(64),
    });
    expect(await screen.findByText("Workflow completed.")).toBeTruthy();
  });

  it("does not present an expired approval as resumable", async () => {
    mocks.history.executions[0] = {
      ...mocks.history.executions[0],
      expired: true,
      status: "awaiting_approval",
    };
    const expiredDetail = {
      execution: {
        ...review,
        expired: true,
        pendingEffect: null,
        canApprove: false,
        canReject: false,
      },
    };
    const fetchMock = vi.fn(async () => json(expiredDetail));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkflowExecutionHistory />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect run" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("button", { name: "Approve and resume" }),
    ).toBeNull();
  });
});
