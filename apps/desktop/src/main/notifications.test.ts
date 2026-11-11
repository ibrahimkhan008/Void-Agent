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
import { registerNotificationHandlers } from "./notification-ipc.js";
import { configureDesktopNotifications } from "./notifications.js";

const origin = "https://app.example";

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
  registerNotificationHandlers();
  return {
    event,
    window,
    show: mocks.handlers.get("notifications:show")!,
    permission: mocks.handlers.get("notifications:get-permission")!,
  };
}

const alert = {
  kind: "needs_approval",
  threadId: "thread-1",
  title: "Approval needed",
  body: "Review and approve to continue.",
  onlyWhenAway: true,
};

describe("desktop native notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.notificationSupported.mockReturnValue(true);
  });

  it("shows validated copy and derives a same-app route from the thread id", () => {
    const { event, show, window } = setup();
    expect(show(event, { ...alert, url: "javascript:alert(1)" })).toBe(true);
    expect(mocks.notificationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        title: alert.title,
        body: alert.body,
        silent: false,
      }),
    );
    expect(mocks.notificationShow).toHaveBeenCalledOnce();
    const click = mocks.notificationOn.mock.calls[0]?.[1];
    click();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(mocks.executeJavaScript).toHaveBeenCalledWith(
      'window.location.assign("/chat/thread-1")',
      true,
    );
  });

  it("rejects forged senders, foreign origins, and malformed thread IDs", () => {
    const { event, show } = setup();
    expect(() => show({ ...event, sender: {} }, alert)).toThrow(
      "Untrusted desktop notification sender",
    );
    expect(() => show(event, { ...alert, threadId: "../settings" })).toThrow(
      "Invalid desktop notification",
    );
    (event.senderFrame as unknown as { url: string }).url =
      "https://attacker.example/chat";
    expect(() => show(event, alert)).toThrow(
      "Untrusted desktop notification origin",
    );
  });

  it("bounds notification copy and suppresses alerts while focused or unsupported", () => {
    const { event, show, window } = setup();
    expect(() => show(event, { ...alert, body: "x".repeat(281) })).toThrow(
      "Invalid desktop notification",
    );
    vi.mocked(window.isFocused).mockReturnValue(true);
    expect(show(event, alert)).toBe(false);
    vi.mocked(window.isFocused).mockReturnValue(false);
    mocks.notificationSupported.mockReturnValue(false);
    expect(show(event, alert)).toBe(false);
    expect(mocks.notificationShow).not.toHaveBeenCalled();
  });
});
