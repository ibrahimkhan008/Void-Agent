import path from "node:path";
import { Menu, type MenuItemConstructorOptions, app, shell } from "electron";
import { buildDesktopApplicationMenu } from "./application-menu.js";
import { checkForUpdatesNow } from "./auto-updater.js";
import { updaterLogPath } from "./updater-log.js";

export function createApplicationMenu(server: {
  /** The host the app is connected to, shown in the menu. */
  host: string | null;
  onChange: () => void;
}): void {
  const isMac = process.platform === "darwin";

  // Windows and Linux show an empty panel unless the fields are supplied, and
  // this is the only place either one reports the installed version: the
  // "about" role below lives in the application menu.
  app.setAboutPanelOptions({
    applicationName: "Keinsaas Navigator",
    applicationVersion: app.getVersion(),
  });

  // The template itself is a pure, unit-tested module
  // (./application-menu.ts): this shell only supplies the callbacks and its
  // own extras on top of the shared skeleton.
  const extraHelpItems: MenuItemConstructorOptions[] = [
    {
      label: "Documentation",
      click: () => {
        void shell.openExternal("https://docs.keinsaas.com");
      },
    },
  ];

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildDesktopApplicationMenu({
        platform: process.platform,
        appName: "Keinsaas Navigator",
        connectedHost: server.host ?? "",
        canOpenDevTools: !app.isPackaged,
        onChangeServer: server.onChange,
        onCheckForUpdates: () => {
          void checkForUpdatesNow("manual");
        },
        onOpenUpdaterLogs: () => {
          void shell.openPath(path.dirname(updaterLogPath()));
        },
        onAbout: () => app.showAboutPanel(),
        ...(isMac
          ? {
              extraAppMenuItems: [
                { type: "separator" as const },
                { role: "services" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
              ],
            }
          : {}),
        extraHelpItems,
      }),
    ),
  );
}
