import type { MenuItemConstructorOptions } from "electron";

export type DesktopApplicationMenuOptions = {
  platform: NodeJS.Platform;
  /** Name shown as the top-level app menu and in the non-mac About item. */
  appName: string;
  connectedHost: string;
  canOpenDevTools: boolean;
  onChangeServer: () => void;
  onCheckForUpdates: () => void;
  onOpenUpdaterLogs: () => void;
  onAbout: () => void;
  /**
   * Extra items spliced into the app menu right before the quit role (the
   * macOS services/hide block). Their own separators are their business.
   */
  extraAppMenuItems?: MenuItemConstructorOptions[];
  /** Extra items placed at the top of the Help menu (Documentation). */
  extraHelpItems?: MenuItemConstructorOptions[];
};

/**
 * Pure, cross-platform application menu template for the desktop shell.
 *
 * Ported from the Void-Agent destination desktop (its application-menu.ts):
 * unlike the imperative menu it replaces, this returns a plain template so
 * the whole menu — server switching, editing, viewing and updates — is
 * unit-testable without Electron. The app menu exists on every platform, so
 * Windows users also get About / Change Server / Quit at the top level.
 */
export function buildDesktopApplicationMenu(
  options: DesktopApplicationMenuOptions,
): MenuItemConstructorOptions[] {
  const mac = options.platform === "darwin";
  const serverItems: MenuItemConstructorOptions[] = [
    ...(options.connectedHost
      ? [{ label: `Connected to ${options.connectedHost}`, enabled: false }]
      : []),
    { label: "Change Server…", click: options.onChangeServer },
  ];

  return [
    {
      label: options.appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        ...serverItems,
        { type: "separator" },
        ...(options.extraAppMenuItems ?? []),
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(options.canOpenDevTools
          ? [{ role: "toggleDevTools" as const }]
          : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        ...(mac
          ? []
          : [
              {
                label: `About ${options.appName}`,
                click: options.onAbout,
              },
              { type: "separator" as const },
            ]),
        ...(options.extraHelpItems ?? []),
        {
          label: "Check for Updates…",
          click: options.onCheckForUpdates,
        },
        {
          label: "Open Update Logs Folder",
          click: options.onOpenUpdaterLogs,
        },
        ...(mac ? [] : [{ type: "separator" as const }, ...serverItems]),
      ],
    },
  ];
}
