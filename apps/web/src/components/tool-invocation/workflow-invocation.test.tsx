// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowInvocation } from "./workflow-invocation";

const result = {
  toolCallId: "call-1",
  workflowName: "Publish release",
  startedAt: 1,
  endedAt: 2,
  history: [],
  status: "awaiting_approval" as const,
  executionId: "00000000-0000-4000-8000-000000000002",
  pendingEffect: {
    nodeId: "00000000-0000-4000-8000-000000000001",
    kind: "http" as const,
    target: "https://api.example.test/release",
    payload: { method: "POST", body: { version: "1.2.3" } },
    hash: "a".repeat(64),
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkflowInvocation pending effect review", () => {
  it("sends the exact pending effect hash and renders the resumed result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          executionId: result.executionId,
          history: [],
          result: { published: true },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkflowInvocation result={result} />);

    fireEvent.click(screen.getByRole("button", { name: /approve action/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      effectHash: "a".repeat(64),
      decision: "approve",
    });
    expect(await screen.findByText("published:")).toBeTruthy();
  });

  it("does not expose approve/reject actions in a read-only transcript", () => {
    render(<WorkflowInvocation result={result} canDecide={false} />);
    expect(
      screen.queryByRole("button", { name: /approve action/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /reject action/i })).toBeNull();
    expect(screen.getByText(/read-only/i)).toBeTruthy();
  });
});
