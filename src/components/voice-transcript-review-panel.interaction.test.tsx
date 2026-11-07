import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
