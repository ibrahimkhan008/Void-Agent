import { describe, expect, it, vi } from "vitest";
import { buildDesktopApplicationMenu } from "./application-menu.js";

function menuLabels(menu: ReturnType<typeof buildDesktopApplicationMenu>) {
  return menu.map((item) => ({
    label: item.label,
    children: Array.isArray(item.submenu)
      ? item.submenu.map((child) => ({
          label: child.label,
          role: child.role,
          type: child.type,
        }))
      : [],
  }));
}

function childrenOf(
  menu: ReturnType<typeof buildDesktopApplicationMenu>,
  index: number,
) {
  const submenu = menu[index]?.submenu;
  return Array.isArray(submenu) ? submenu : [];
}

describe("desktop application menu template", () => {
  it("provides server switching, editing, viewing, and updates on Windows", () => {
    const onChangeServer = vi.fn();
    const onCheckForUpdates = vi.fn();
    const onOpenUpdaterLogs = vi.fn();
    const onAbout = vi.fn();
    const menu = buildDesktopApplicationMenu({
      platform: "win32",
      appName: "Keinsaas Navigator",
      connectedHost: "app.example",
      canOpenDevTools: false,
      onChangeServer,
      onCheckForUpdates,
      onOpenUpdaterLogs,
      onAbout,
    });

    const labels = menuLabels(menu);
    expect(labels.map((item) => item.label)).toEqual([
      "Keinsaas Navigator",
      "Edit",
      "View",
      "Help",
    ]);
    expect(labels[0]?.children).toContainEqual({
      label: "Connected to app.example",
      role: undefined,
      type: undefined,
    });
    expect(labels[1]?.children).toContainEqual({
      label: undefined,
      role: "paste",
      type: undefined,
    });
    expect(labels[2]?.children).not.toContainEqual({
      label: undefined,
      role: "toggleDevTools",
      type: undefined,
    });
    expect(labels[3]?.children).toContainEqual({
      label: "Check for Updates…",
      role: undefined,
      type: undefined,
    });
    expect(labels[3]?.children).toContainEqual({
      label: "Open Update Logs Folder",
      role: undefined,
      type: undefined,
    });

    const serverItem = childrenOf(menu, 0).find(
      (item) => "label" in item && item.label === "Change Server…",
    );
    if (serverItem && "click" in serverItem && serverItem.click)
      serverItem.click({} as never, {} as never, {} as KeyboardEvent);
    expect(onChangeServer).toHaveBeenCalledOnce();

    const updateItem = childrenOf(menu, 3).find(
      (item) => "label" in item && item.label === "Check for Updates…",
    );
    if (updateItem && "click" in updateItem && updateItem.click)
      updateItem.click({} as never, {} as never, {} as KeyboardEvent);
    expect(onCheckForUpdates).toHaveBeenCalledOnce();

    const logsItem = childrenOf(menu, 3).find(
      (item) => "label" in item && item.label === "Open Update Logs Folder",
    );
    if (logsItem && "click" in logsItem && logsItem.click)
      logsItem.click({} as never, {} as never, {} as KeyboardEvent);
    expect(onOpenUpdaterLogs).toHaveBeenCalledOnce();

    const aboutItem = childrenOf(menu, 3).find(
      (item) => "label" in item && item.label === "About Keinsaas Navigator",
    );
    if (aboutItem && "click" in aboutItem && aboutItem.click)
      aboutItem.click({} as never, {} as never, {} as KeyboardEvent);
    expect(onAbout).toHaveBeenCalledOnce();
  });

  it("keeps the macOS about role and only exposes tools in development", () => {
    const onAbout = vi.fn();
    const menu = buildDesktopApplicationMenu({
      platform: "darwin",
      appName: "Keinsaas Navigator",
      connectedHost: "",
      canOpenDevTools: true,
      onChangeServer: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onOpenUpdaterLogs: vi.fn(),
      onAbout,
    });
    const labels = menuLabels(menu);

    expect(labels[0]?.children).toContainEqual({
      label: undefined,
      role: "about",
      type: undefined,
    });
    expect(labels[2]?.children).toContainEqual({
      label: undefined,
      role: "toggleDevTools",
      type: undefined,
    });
    expect(labels[3]?.children.map((child) => child.label)).not.toContain(
      "About Keinsaas Navigator",
    );
    expect(onAbout).not.toHaveBeenCalled();
  });

  it("splices host extras into the app and Help menus", () => {
    const menu = buildDesktopApplicationMenu({
      platform: "darwin",
      appName: "Keinsaas Navigator",
      connectedHost: "app.example",
      canOpenDevTools: false,
      onChangeServer: vi.fn(),
      onCheckForUpdates: vi.fn(),
      onOpenUpdaterLogs: vi.fn(),
      onAbout: vi.fn(),
      extraAppMenuItems: [
        { type: "separator" as const },
        { role: "services" as const },
        { type: "separator" as const },
      ],
      extraHelpItems: [{ label: "Documentation" }],
    });

    const appChildren = childrenOf(menu, 0);
    // Extras land right before the quit role, after the server items.
    const changeServerIndex = appChildren.findIndex(
      (item) => "label" in item && item.label === "Change Server…",
    );
    expect(appChildren[changeServerIndex + 2]).toMatchObject({
      type: "separator",
    });
    expect(appChildren[changeServerIndex + 3]).toMatchObject({
      role: "services",
    });
    expect(appChildren[appChildren.length - 1]).toMatchObject({ role: "quit" });

    // Help extras come first, before the updates entries.
    const helpChildren = childrenOf(menu, 3);
    expect(helpChildren[0]).toMatchObject({ label: "Documentation" });
    expect(helpChildren[1]).toMatchObject({ label: "Check for Updates…" });
  });
});
