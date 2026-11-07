import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { buildVoiceDraftHandoff } from "lib/voice/draft-handoff";
/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, props.children),
  };
});

import { VoiceTranscriptReviewPanel } from "./voice-transcript-review-panel";

const messageId = "00000000-0000-4000-8000-000000000001";

describe("voice transcript draft handoff UI", () => {
  const fetchMock = vi.fn();
  const onSend = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onSend.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function loadPreview(intent: "agent" | "scheduled_agent" | "workflow") {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        preview: {
          intent,
          title: "Daily research agent",
          summary: "Prepare a recurring research assistant.",
        },
      }),
    });
    render(
      <VoiceTranscriptReviewPanel
        messageId={messageId}
        transcript="Create an assistant for weekly market monitoring."
        sending={false}
        onCancel={() => undefined}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview intent" }));
    await screen.findByText(`Intent preview: ${intent.replaceAll("_", " ")}`);
  }

  it("hands an agent request to the normal editable CreateAgent approval path", async () => {
    const transcript = "Create an assistant for weekly market monitoring.";
    await loadPreview("scheduled_agent");
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare editable agent proposal" }),
    );
    expect(onSend).toHaveBeenCalledWith(
      buildVoiceDraftHandoff(transcript, "scheduled_agent"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/voice/transcript/preview");
  });

  it("hands workflow intent to planning only, without calling execution APIs", async () => {
    const transcript = "Create a flow for incoming support requests.";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        preview: {
          intent: "workflow",
          title: "Support request flow",
          summary: "Route incoming requests to a review step.",
        },
      }),
    });
    render(
      <VoiceTranscriptReviewPanel
        messageId={messageId}
        transcript={transcript}
        sending={false}
        onCancel={() => undefined}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview intent" }));
    await screen.findByText("Intent preview: workflow");
    fireEvent.click(
      screen.getByRole("button", { name: "Plan workflow in chat" }),
    );
    expect(onSend).toHaveBeenCalledWith(
      buildVoiceDraftHandoff(transcript, "workflow"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/voice/transcript/preview");
  });

  it("shows the exact task payload, issues a review token, and executes only that payload", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          preview: {
            intent: "task",
            title: "Review launch",
            summary: "Create a launch review task.",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: "workspace",
          items: [{ id: "workspace-1", name: "Main workspace" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: "project",
          items: [{ id: "project-1", name: "Launch project" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ approvalToken: "t".repeat(48) }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(
      <VoiceTranscriptReviewPanel
        messageId={messageId}
        transcript="Create a task to review the launch checklist."
        sending={false}
        onCancel={() => undefined}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview intent" }));
    await screen.findByText("Intent preview: task");
    const workspaceSelect = await screen.findByRole("combobox", {
      name: "Workspace",
    });
    fireEvent.change(workspaceSelect, { target: { value: "workspace-1" } });
    const projectSelect = await screen.findByRole("combobox", {
      name: "Project",
    });
    fireEvent.change(projectSelect, { target: { value: "project-1" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and create task" }),
    );
    await screen.findByText("Created “Review launch” in Launch project.");

    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "/api/voice/transcript/task-command",
    );
    expect(
      JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string),
    ).toMatchObject({
      action: "approve",
      messageId,
      provider: "asana",
      parentId: "workspace-1",
      targetId: "project-1",
      name: "Review launch",
      details: "Create a task to review the launch checklist.",
    });
    expect(
      JSON.parse(fetchMock.mock.calls[4]?.[1]?.body as string),
    ).toMatchObject({
      action: "execute",
      messageId,
      approvalToken: "t".repeat(48),
      targetId: "project-1",
    });
    expect(onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });
});
