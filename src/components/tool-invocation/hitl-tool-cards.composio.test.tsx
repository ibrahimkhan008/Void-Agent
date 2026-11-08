// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ToolUIPart } from "ai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HitlToolCard } from "./hitl-tool-cards";

vi.mock("ui/button", () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ComponentProps<"button"> & { size?: string; variant?: string }) =>
    React.createElement("button", props, children),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const proposalInput = {
  accountLabel: "work@example.com",
  accountRef: `void-composio-account-ref-v1.${"A".repeat(64)}`,
  toolkitSlug: "google_sheets",
  actionSlug: "GOOGLE_SHEETS_CREATE_SPREADSHEET",
  actionVersion: "2026-10-01",
  schemaFingerprint: "a".repeat(64),
  arguments: { title: "Quarterly plan", rows: [["Q1", 42]] },
};

function renderProposal(addToolResult = vi.fn().mockResolvedValue(undefined)) {
  const part = {
    type: "tool-proposeComposioWriteAction",
    toolCallId: "call-42",
    state: "input-available",
    input: proposalInput,
  } as unknown as ToolUIPart;
  render(<HitlToolCard part={part} addToolResult={addToolResult as never} />);
  return { addToolResult };
}

describe("Composio write approval card", () => {
  it("shows the exact target and arguments and requires explicit approval", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { addToolResult } = renderProposal();

    expect(screen.getByText("work@example.com")).not.toBeNull();
    expect(screen.getByText(proposalInput.accountRef)).not.toBeNull();
    expect(screen.getByText("google_sheets")).not.toBeNull();
    expect(screen.getByText("GOOGLE_SHEETS_CREATE_SPREADSHEET")).not.toBeNull();
    expect(screen.getByText(/Quarterly plan/)).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addToolResult).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(addToolResult).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addToolResult).toHaveBeenCalledWith({
      tool: "proposeComposioWriteAction",
      toolCallId: "call-42",
      output: { approved: false, rejected: true },
    });
  });

  it("requests a server approval token before returning the unchanged proposal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ approvalToken: "one-use-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { addToolResult } = renderProposal();

    fireEvent.click(
      screen.getByRole("button", { name: "Approve exact action" }),
    );

    await waitFor(() => expect(addToolResult).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approvals/composio",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(proposalInput),
      }),
    );
    expect(addToolResult).toHaveBeenCalledWith({
      tool: "proposeComposioWriteAction",
      toolCallId: "call-42",
      output: {
        approved: true,
        ...proposalInput,
        approvalToken: "one-use-token",
      },
    });
  });

  it("keeps approval errors visible and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Action changed; review it again." }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ approvalToken: "retry-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { addToolResult } = renderProposal();

    fireEvent.click(
      screen.getByRole("button", { name: "Approve exact action" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Action changed; review it again.",
    );
    expect(addToolResult).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Approve exact action" }),
    );
    await waitFor(() => expect(addToolResult).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
