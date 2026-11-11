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
import { WorkflowRunReview } from "./workflow-run-review";

const proposal = {
  platform: "saved-workflow" as const,
  target: "00000000-0000-4000-8000-000000000001",
  workflowName: "Publish release",
  approvalTokenField: "voidAgentWorkflowApprovalToken",
  payload: { version: "1.2.3" },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkflowRunReview", () => {
  it("shows the reviewed effects and only issues a token after explicit approval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            graphRevision: "a".repeat(64),
            effects: ["POST https://example.test/release"],
            issues: [],
            reviewable: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ approvalToken: "one-use-token" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onResolve = vi.fn();
    render(<WorkflowRunReview proposal={proposal} onResolve={onResolve} />);

    expect(
      await screen.findByText("POST https://example.test/release"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /approve exact run/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith({
        approved: true,
        approvalToken: "one-use-token",
        graphRevision: "a".repeat(64),
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      ...proposal,
      graphRevision: "a".repeat(64),
    });
  });

  it("does not enable approval when the exact effects cannot be reviewed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            graphRevision: "a".repeat(64),
            effects: [],
            issues: ["Dynamic action arguments cannot be reviewed"],
            reviewable: false,
          }),
          { status: 200 },
        ),
      ),
    );
    render(<WorkflowRunReview proposal={proposal} onResolve={vi.fn()} />);

    expect(
      await screen.findByText("Dynamic action arguments cannot be reviewed"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /approve exact run/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
