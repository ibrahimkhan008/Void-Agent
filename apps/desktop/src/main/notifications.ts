import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  Notification,
  ipcMain,
} from "electron";

export type DesktopAgentAlertKind =
  | "complete"
  | "needs_approval"
  | "needs_input"
  | "error";

type DesktopAgentAlert = { kind: DesktopAgentAlertKind; threadId: string };

const COPY: Record<DesktopAgentAlertKind, { title: string; body: string }> = {
  complete: {
    title: "Void-Agent response ready",
    body: "Your chat response is ready.",
  },
  needs_approval: {
    title: "Void-Agent needs your approval",
    body: "A chat is waiting for your review.",
  },
  needs_input: {
    title: "Void-Agent needs your input",
    body: "A chat is waiting for your response.",
  },
  error: {
    title: "Void-Agent response issue",
    body: "A chat response needs attention.",
  },
};

let trustedWindow: BrowserWindow | null = null;
let trustedOrigin = "";

export function configureDesktopNotifications(
  window: BrowserWindow,
  origin: string,
) {
  trustedWindow = window;
  trustedOrigin = origin;
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const window = trustedWindow;
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

function parseAlert(raw: unknown): DesktopAgentAlert {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid desktop notification");
  }
  const value = raw as Record<string, unknown>;
  if (
    !Object.hasOwn(COPY, value.kind as string) ||
    typeof value.threadId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.threadId)
  ) {
    throw new Error("Invalid desktop notification");
  }
  return {
    kind: value.kind as DesktopAgentAlertKind,
    threadId: value.threadId,
  };
}

export function registerDesktopNotificationHandlers() {
  ipcMain.handle("notifications:show", (event, raw: unknown) => {
    assertTrustedSender(event);
    const alert = parseAlert(raw);
    const window = trustedWindow;
    if (!window || window.isDestroyed()) return false;
    if (window.isFocused() && !window.isMinimized()) return false;
    if (!Notification.isSupported()) return false;

    const copy = COPY[alert.kind];
    const notification = new Notification(copy);
    notification.on("click", () => {
      if (!trustedWindow || trustedWindow.isDestroyed()) return;
      if (trustedWindow.isMinimized()) trustedWindow.restore();
      trustedWindow.show();
      trustedWindow.focus();
      const path = `/chat/${encodeURIComponent(alert.threadId)}`;
      void trustedWindow.webContents.executeJavaScript(
        `window.location.assign(${JSON.stringify(path)})`,
        true,
      );
    });
    notification.show();
    return true;
  });

  ipcMain.handle("notifications:get-permission", (event) => {
    assertTrustedSender(event);
    return Notification.isSupported() ? "granted" : "unsupported";
  });

  ipcMain.handle("notifications:request-permission", (event) => {
    assertTrustedSender(event);
    return Notification.isSupported() ? "granted" : "unsupported";
  });
}
