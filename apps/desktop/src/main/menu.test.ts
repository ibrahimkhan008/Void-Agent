import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn(),
  setAboutPanelOptions: vi.fn(),
  openPath: vi.fn(async () => ""),
  updaterLogPath: vi.fn(() => "C:/Users/test/AppData/Logs/updater.log"),
  isPackaged: true,
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
  app: {
    getVersion: () => "1.0.0",
    setAboutPanelOptions: mocks.setAboutPanelOptions,
    isPackaged: mocks.isPackaged,
  },
  shell: { openPath: mocks.openPath },
}));

vi.mock("./auto-updater.js", () => ({
  checkForUpdatesNow: vi.fn(),
}));

vi.mock("./updater-log.js", () => ({
  updaterLogPath: mocks.updaterLogPath,
}));

import { createApplicationMenu } from "./menu.js";

describe("desktop application menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the updater log folder and keeps packaged DevTools closed", async () => {
    createApplicationMenu({ host: "app.example", onChange: vi.fn() });
    const template = mocks.buildFromTemplate.mock.calls[0]?.[0] as Array<{
      label?: string;
      submenu?: Array<{
        label?: string;
        role?: string;
        click?: () => void;
      }>;
    }>;
    const view = template.find((item) => item.label === "View")?.submenu ?? [];
    expect(view.some((item) => item.role === "toggleDevTools")).toBe(false);

    const help = template.find((item) => item.label === "Help")?.submenu ?? [];
    const openLogs = help.find(
      (item) => item.label === "Open Update Logs Folder",
    );
    expect(openLogs).toBeDefined();
    openLogs?.click?.();
    await Promise.resolve();
    expect(mocks.openPath).toHaveBeenCalledWith("C:/Users/test/AppData/Logs");
  });
});
