/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      createElement("button", props, props.children),
  };
});
vi.mock("ui/input", async () => {
  const { createElement } = await import("react");
  return {
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      createElement("input", props),
  };
});
vi.mock("@/components/voice-capture-summary-panel", () => ({
  VoiceCaptureSummaryPanel: () => null,
}));

import { VoiceDevicesDashboard } from "./voice-devices-dashboard";

const device = {
  id: "11111111-1111-4111-8111-111111111111",
  deviceType: "M5Stack",
  displayName: "Desk device",
  status: "active",
  firmwareVersion: null,
  lastSeenAt: null,
  createdAt: "2026-11-07T12:00:00Z",
};
const session = {
  id: "row-1",
  sessionId: "session-1",
  status: "completed",
  segmentCount: 1,
  startedAt: "2026-11-07T12:00:00Z",
  lastSegmentAt: "2026-11-07T12:00:01Z",
  finalizedAt: "2026-11-07T12:00:02Z",
  transcript: "Hello there",
  threadId: null,
  messageId: null,
};

describe("voice device segment review", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/voice/devices")
        return Response.json({ devices: [device] });
      if (url.endsWith("/history?limit=20"))
        return Response.json({ items: [] });
      if (url.endsWith("/sessions?limit=20"))
        return Response.json({ items: [session] });
      if (url.endsWith("/sessions/session-1/segments"))
        return Response.json({
          items: [
            {
              eventId: "evt-1",
              sequenceNumber: 0,
              text: "Hello there",
              language: "en",
              createdAt: "2026-11-07T12:00:01Z",
            },
          ],
          truncated: false,
        });
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads owner-visible segment detail on demand from the session card", async () => {
    render(<VoiceDevicesDashboard />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Show recent transcripts for Desk device",
      }),
    );
    await screen.findByText("Hello there");
    fireEvent.click(screen.getByRole("button", { name: "Show segments" }));
    const segmentMetadata = await screen.findByText(
      (_, element) =>
        element?.tagName === "P" &&
        Boolean(element.textContent?.includes("Segment 1")) &&
        Boolean(element.textContent?.includes("en")),
    );
    expect(segmentMetadata).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/voice/devices/${device.id}/sessions/session-1/segments`,
      { cache: "no-store" },
    );
  });
});
