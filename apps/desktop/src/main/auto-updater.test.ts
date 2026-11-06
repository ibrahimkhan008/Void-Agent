import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  showMessageBox: vi.fn(),
  appOn: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { isPackaged: false, getVersion: () => "0.1.0", on: mocks.appOn },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) =>
      mocks.handlers.set(channel, handler),
  },
}));

import {
  registerUpdateIpcHandlers,
  setUpdateMainWindow,
} from "./auto-updater.js";

const frame = (url: string) => ({ url });

describe("desktop updater IPC boundary", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
  });

  it("allows state reads only from the configured app main frame", async () => {
    const webContents = {
      mainFrame: frame("https://void.test/"),
      send: vi.fn(),
    };
    const window = { webContents, isDestroyed: () => false };
    setUpdateMainWindow(window as never, "https://void.test");
    registerUpdateIpcHandlers();
    const getState = mocks.handlers.get("updates:get-state");
    expect(getState).toBeDefined();

    const badEvent = {
      sender: {},
      senderFrame: frame("https://void.test/"),
    } as never;
    expect(() => getState?.(badEvent)).toThrow("Untrusted desktop IPC sender");

    const goodEvent = {
      sender: webContents,
      senderFrame: webContents.mainFrame,
    } as never;
    expect(getState?.(goodEvent)).toMatchObject({ status: "idle" });
  });
});
