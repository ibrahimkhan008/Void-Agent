import { Notification } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { resolveAppIconPath } from "./icon.js";

export type DesktopAgentAlertPayload = {
  kind: "complete" | "needs_approval" | "needs_input" | "error";
  threadId?: string;
  title: string;
  body: string;
  onlyWhenAway?: boolean;
};

let mainWindow: BrowserWindow | null = null;
let trustedOrigin = "";

export function configureDesktopNotifications(
  window: BrowserWindow | null,
  origin: string,
): void {
  mainWindow = window;
  trustedOrigin = origin;
}

export function assertTrustedNotificationSender(
  event: IpcMainInvokeEvent,
): void {
  const window = mainWindow;
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  ) {
    throw new Error("Untrusted desktop notification sender");
  }
  try {
    if (new URL(event.senderFrame.url).origin !== trustedOrigin) {
      throw new Error("Untrusted desktop notification origin");
    }
  } catch {
    throw new Error("Untrusted desktop notification origin");
  }
}

export function parseDesktopNotification(
  raw: unknown,
): DesktopAgentAlertPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid desktop notification");
  }
  const value = raw as Record<string, unknown>;
  const allowedKinds = new Set([
    "complete",
    "needs_approval",
    "needs_input",
    "error",
  ]);
  if (
    !allowedKinds.has(value.kind as string) ||
    (value.threadId !== undefined &&
      (typeof value.threadId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(value.threadId))) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 120 ||
    typeof value.body !== "string" ||
    !value.body.trim() ||
    value.body.length > 280 ||
    (value.onlyWhenAway !== undefined &&
      typeof value.onlyWhenAway !== "boolean")
  ) {
    throw new Error("Invalid desktop notification");
  }
  return {
    kind: value.kind as DesktopAgentAlertPayload["kind"],
    ...(typeof value.threadId === "string" ? { threadId: value.threadId } : {}),
    title: value.title,
    body: value.body,
    ...(typeof value.onlyWhenAway === "boolean"
      ? { onlyWhenAway: value.onlyWhenAway }
      : {}),
  };
}

export function showDesktopAgentNotification(
  payload: DesktopAgentAlertPayload,
): boolean {
  if (payload.onlyWhenAway !== false && mainWindow) {
    const focused = mainWindow.isFocused();
    const minimized = mainWindow.isMinimized();
    if (focused && !minimized) {
      return false;
    }
  }
  if (!mainWindow || mainWindow.isDestroyed() || !Notification.isSupported()) {
    return false;
  }

  const icon = resolveAppIconPath();
  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    ...(icon ? { icon } : {}),
    silent: false,
  });

  notification.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    const path = payload.threadId
      ? `/chat/${encodeURIComponent(payload.threadId)}`
      : "/";
    void mainWindow.webContents.executeJavaScript(
      `window.location.assign(${JSON.stringify(path)})`,
      true,
    );
  });
  notification.show();
  return true;
}
