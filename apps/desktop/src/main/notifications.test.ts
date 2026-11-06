import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  notificationOn: vi.fn(),
  notificationShow: vi.fn(),
  notificationSupported: vi.fn(() => true),
  notificationOptions: vi.fn(),
  executeJavaScript: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  Notification: class {
    constructor(options: unknown) {
      mocks.notificationOptions(options);
    }
    on = mocks.notificationOn;
    show = mocks.notificationShow;
    static isSupported = mocks.notificationSupported;
  },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => unknown) =>
      mocks.handlers.set(name, handler),
  },
}));

import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import {
  configureDesktopNotifications,
  registerDesktopNotificationHandlers,
} from "./notifications.js";

const origin = "https://void-agent.example";

function setup() {
  const frame = { url: `${origin}/chat/thread-1` };
  const webContents = {
    mainFrame: frame,
    executeJavaScript: mocks.executeJavaScript,
  };
  const window = {
    webContents,
    isDestroyed: () => false,
    isFocused: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  } as unknown as BrowserWindow;
  const event = {
    sender: webContents,
    senderFrame: frame,
  } as unknown as IpcMainInvokeEvent;
  configureDesktopNotifications(window, origin);
  registerDesktopNotificationHandlers();
  return {
    event,
    window,
    show: mocks.handlers.get("notifications:show")!,
    permission: mocks.handlers.get("notifications:get-permission")!,
  };
}

describe("desktop native notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.notificationSupported.mockReturnValue(true);
  });

  it("uses fixed generic copy and builds a local route from a validated thread ID", () => {
    const { event, show, window } = setup();
    expect(show(event, { kind: "needs_approval", threadId: "thread-1" })).toBe(
      true,
    );
    expect(mocks.notificationOptions).toHaveBeenCalledWith({
      title: "Void-Agent needs your approval",
      body: "A chat is waiting for your review.",
    });
    const click = mocks.notificationOn.mock.calls[0]?.[1];
    click();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(mocks.executeJavaScript).toHaveBeenCalledWith(
      'window.location.assign("/chat/thread-1")',
      true,
    );
  });

  it("rejects forged IPC senders and malformed route identifiers", () => {
    const { event, show } = setup();
    expect(() =>
      show({ ...event, sender: {} }, { kind: "complete", threadId: "x" }),
    ).toThrow("Untrusted desktop notification sender");
    expect(() =>
      show(event, { kind: "complete", threadId: "../settings" }),
    ).toThrow("Invalid desktop notification");
    expect(() =>
      show(event, { kind: "complete", threadId: "x", title: "secret" }),
    ).not.toThrow();
    expect(mocks.notificationOptions).toHaveBeenCalledWith({
      title: "Void-Agent response ready",
      body: "Your chat response is ready.",
    });
  });

  it("suppresses alerts while focused and when native notifications are unsupported", () => {
    const { event, show, window } = setup();
    vi.mocked(window.isFocused).mockReturnValue(true);
    expect(show(event, { kind: "complete", threadId: "thread-1" })).toBe(false);
    vi.mocked(window.isFocused).mockReturnValue(false);
    mocks.notificationSupported.mockReturnValue(false);
    expect(show(event, { kind: "complete", threadId: "thread-1" })).toBe(false);
    expect(mocks.notificationShow).not.toHaveBeenCalled();
  });

  it("rejects a trusted window frame with an untrusted origin", () => {
    const { event: trustedEvent, show } = setup();
    (trustedEvent.senderFrame as unknown as { url: string }).url =
      "https://evil.example/chat";
    expect(() =>
      show(trustedEvent, { kind: "error", threadId: "thread-1" }),
    ).toThrow("Untrusted desktop notification origin");
  });
});
