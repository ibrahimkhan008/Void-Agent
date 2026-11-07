import type { MenuItemConstructorOptions } from "electron";

export type DesktopApplicationMenuOptions = {
  platform: NodeJS.Platform;
  connectedHost: string;
  canOpenDevTools: boolean;
  onChangeServer: () => void;
  onCheckForUpdates: () => void;
  onAbout: () => void;
};

/** Native cross-platform menus for the Void-Agent desktop companion. */
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
      label: "Void-Agent",
      submenu: [
        { role: "about" },
        { type: "separator" },
        ...serverItems,
        { type: "separator" },
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
              { label: "About Void-Agent", click: options.onAbout },
              { type: "separator" as const },
            ]),
        {
          label: "Check for Updates…",
          click: options.onCheckForUpdates,
        },
        ...(mac ? [] : [{ type: "separator" as const }, ...serverItems]),
      ],
    },
  ];
}
