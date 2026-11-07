/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
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
});
