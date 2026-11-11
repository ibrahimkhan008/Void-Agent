import { ipcMain } from "electron";
import {
  assertTrustedNotificationSender,
  configureDesktopNotifications,
  parseDesktopNotification,
  showDesktopAgentNotification,
} from "./notifications.js";

export function registerNotificationHandlers(): void {
  ipcMain.handle("notifications:show", (event, raw: unknown) => {
    assertTrustedNotificationSender(event);
    return showDesktopAgentNotification(parseDesktopNotification(raw));
  });

  ipcMain.handle("notifications:get-permission", (event) => {
    assertTrustedNotificationSender(event);
    return "granted";
  });

  ipcMain.handle("notifications:request-permission", (event) => {
    assertTrustedNotificationSender(event);
    return "granted";
  });
}

export { configureDesktopNotifications };
