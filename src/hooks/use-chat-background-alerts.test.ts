// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { preferences, toastMock } = vi.hoisted(() => ({
  preferences: { notifications: { backgroundChatAlerts: true } },
  toastMock: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("swr", () => ({ default: () => ({ data: preferences }) }));

import {
  findPendingUserAction,
  useChatBackgroundAlerts,
} from "./use-chat-background-alerts";

const message = (part: Record<string, unknown>) =>
  ({ role: "assistant", parts: [part] }) as unknown as UIMessage;

type ChatAlertHookProps = {
  threadId: string;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
};

describe("findPendingUserAction", () => {
  it("identifies proposal tools waiting for user approval", () => {
    expect(
      findPendingUserAction([
        message({
          type: "tool-proposeEmail",
          toolCallId: "call-1",
          state: "input-available",
          input: {},
        }),
      ]),
    ).toEqual({ eventId: "call-1", kind: "needs_approval" });
  });

  it("identifies requestInput without treating completed tools as pending", () => {
    expect(
      findPendingUserAction([
        message({
          type: "tool-requestInput",
          toolCallId: "call-2",
          state: "input-available",
          input: {},
        }),
      ]),
    ).toEqual({ eventId: "call-2", kind: "needs_input" });
    expect(
      findPendingUserAction([
        message({
          type: "tool-proposeEmail",
          toolCallId: "call-3",
          state: "output-available",
          input: {},
          output: { approved: false },
        }),
      ]),
    ).toBeNull();
  });
});

describe("useChatBackgroundAlerts delivery", () => {
  let desktopShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    preferences.notifications.backgroundChatAlerts = true;
    toastMock.mockClear();
    desktopShow = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: { notifications: { show: desktopShow } },
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as Window & { desktop?: unknown }).desktop;
  });

  it("shows generic foreground completion alerts without message text", async () => {
    const initial: ChatAlertHookProps = {
      threadId: "thread-foreground-1",
      messages: [] as UIMessage[],
      status: "streaming",
    };
    const { rerender } = renderHook(
      (props: ChatAlertHookProps) => useChatBackgroundAlerts(props),
      { initialProps: initial },
    );

    await act(async () => {
      rerender({
        ...initial,
        messages: [
          {
            id: "message-foreground-1",
            role: "assistant",
            parts: [{ type: "text", text: "private response text" }],
          } as UIMessage,
        ],
        status: "ready",
      });
    });

    expect(toastMock).toHaveBeenCalledOnce();
    expect(toastMock.mock.calls[0][0]).toBe("Void-Agent response ready");
    expect(toastMock.mock.calls[0][1].description).toBe(
      "Your chat response is ready.",
    );
    expect(JSON.stringify(toastMock.mock.calls[0])).not.toContain(
      "private response text",
    );
    expect(toastMock.mock.calls[0][1].action.label).toBe("Open chat");
    expect(desktopShow).not.toHaveBeenCalled();
  });

  it("uses only background delivery while hidden and does not replay on becoming visible", async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    const initial: ChatAlertHookProps = {
      threadId: "thread-hidden-1",
      messages: [] as UIMessage[],
      status: "submitted",
    };
    const { rerender } = renderHook(
      (props: ChatAlertHookProps) => useChatBackgroundAlerts(props),
      { initialProps: initial },
    );

    await act(async () => {
      rerender({
        ...initial,
        messages: [
          { id: "message-hidden-1", role: "assistant", parts: [] } as UIMessage,
        ],
        status: "ready",
      });
    });
    expect(desktopShow).toHaveBeenCalledOnce();
    expect(toastMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    await act(async () => {
      rerender({
        ...initial,
        messages: [
          { id: "message-hidden-1", role: "assistant", parts: [] } as UIMessage,
        ],
        status: "ready",
      });
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("does not alert when the user preference is off", async () => {
    preferences.notifications.backgroundChatAlerts = false;
    const initial: ChatAlertHookProps = {
      threadId: "thread-disabled-1",
      messages: [] as UIMessage[],
      status: "streaming",
    };
    const { rerender } = renderHook(
      (props: ChatAlertHookProps) => useChatBackgroundAlerts(props),
      { initialProps: initial },
    );

    await act(async () => {
      rerender({ ...initial, status: "error" });
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(desktopShow).not.toHaveBeenCalled();
  });

  it("surfaces a pending approval in the foreground with generic copy", async () => {
    const props = {
      threadId: "thread-approval-1",
      status: "ready" as const,
      messages: [
        {
          role: "assistant",
          parts: [
            {
              type: "tool-proposeEmail",
              toolCallId: "approval-call-1",
              state: "input-available",
              input: { privateRecipient: "secret@example.com" },
            },
          ],
        } as unknown as UIMessage,
      ],
    };
    renderHook(() => useChatBackgroundAlerts(props));

    expect(toastMock).toHaveBeenCalledOnce();
    expect(toastMock.mock.calls[0][0]).toBe("Void-Agent needs your approval");
    expect(JSON.stringify(toastMock.mock.calls[0])).not.toContain(
      "secret@example.com",
    );
    expect(desktopShow).not.toHaveBeenCalled();
  });
});
