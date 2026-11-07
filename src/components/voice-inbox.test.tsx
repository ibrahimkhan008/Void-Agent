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
  Button: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      asChild?: boolean;
    },
  ) => {
    const { asChild: _asChild, ...rest } = props;
    return <button {...rest}>{props.children}</button>;
  },
}));
vi.mock("ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => (
    <article>{children}</article>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{props.children}</a>
  ),
}));

import { VoiceInbox } from "./voice-inbox";

describe("VoiceInbox", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a saved device transcript and links to the existing review flow", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "message-1",
            threadId: "thread-1",
            title: "Device voice note",
            text: "Turn left at the next street",
            source: "voice_device",
            createdAt: "2026-11-07T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    });
    render(<VoiceInbox />);
    expect(
      await screen.findByText("Turn left at the next street"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review in chat" }).getAttribute("href"),
    ).toBe("/chat/thread-1?processVoice=message-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/inbox", {
      cache: "no-store",
    });
  });

  it("previews intent on request without submitting or executing the transcript", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "message-1",
              threadId: "thread-1",
              title: "Device voice note",
              text: "Send an email to Ana",
              source: "voice_device",
              createdAt: "2026-11-07T12:00:00.000Z",
            },
          ],
          nextCursor: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          preview: {
            intent: "task",
            title: "Email Ana",
            summary: "The transcript requests sending an email to Ana.",
          },
        }),
      });
    render(<VoiceInbox />);
    const button = await screen.findByRole("button", {
      name: "Preview intent for Device voice note",
    });
    fireEvent.click(button);

    expect(await screen.findByText("Email Ana · task")).toBeTruthy();
    expect(
      screen.getByText("Preview only. No task or tool was run."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/voice/transcript/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ messageId: "message-1" }),
        cache: "no-store",
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("body", {
      text: "Send an email to Ana",
    });
  });

  it("offers a retry after preview failure", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "message-1",
              threadId: "thread-1",
              title: "Device voice note",
              text: "Remember to call Ana",
              source: "voice_device",
              createdAt: "2026-11-07T12:00:00.000Z",
            },
          ],
          nextCursor: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Could not preview this transcript." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          preview: {
            intent: "note",
            title: "Call Ana",
            summary: "A reminder to call Ana.",
          },
        }),
      });
    render(<VoiceInbox />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Preview intent for Device voice note",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not preview this transcript.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry intent for Device voice note",
      }),
    );
    expect(await screen.findByText("Call Ana · note")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
