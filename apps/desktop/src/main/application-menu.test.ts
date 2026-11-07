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

describe("Void-Agent desktop application menu", () => {
  it("provides server switching, editing, viewing, and updates on Windows", () => {
    const onChangeServer = vi.fn();
    const onCheckForUpdates = vi.fn();
    const onAbout = vi.fn();
    const menu = buildDesktopApplicationMenu({
      platform: "win32",
      connectedHost: "agent.example",
      canOpenDevTools: false,
      onChangeServer,
      onCheckForUpdates,
      onAbout,
    });

    const labels = menuLabels(menu);
    expect(labels.map((item) => item.label)).toEqual([
      "Void-Agent",
      "Edit",
      "View",
      "Help",
    ]);
    expect(labels[0]?.children).toContainEqual({
      label: "Connected to agent.example",
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

    const aboutItem = childrenOf(menu, 3).find(
      (item) => "label" in item && item.label === "About Void-Agent",
    );
    if (aboutItem && "click" in aboutItem && aboutItem.click)
      aboutItem.click({} as never, {} as never, {} as KeyboardEvent);
    expect(onAbout).toHaveBeenCalledOnce();
  });

  it("keeps the macOS about role and only exposes tools in development", () => {
    const onAbout = vi.fn();
    const menu = buildDesktopApplicationMenu({
      platform: "darwin",
      connectedHost: "",
      canOpenDevTools: true,
      onChangeServer: vi.fn(),
      onCheckForUpdates: vi.fn(),
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
      "About Void-Agent",
    );
    expect(onAbout).not.toHaveBeenCalled();
  });
});
