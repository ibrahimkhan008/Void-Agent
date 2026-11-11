import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  showMessageBox: vi.fn(),
  listDesktopMcpTools: vi.fn(),
  callDesktopMcpTool: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      name: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => {
      mocks.handlers.set(name, handler);
    },
  },
  dialog: { showMessageBox: mocks.showMessageBox },
}));
vi.mock("./mcp-spawner.js", () => ({
  listDesktopMcpTools: mocks.listDesktopMcpTools,
  callDesktopMcpTool: mocks.callDesktopMcpTool,
}));
vi.mock("./audit-sink.js", () => ({
  parseAuditEvent: (event: unknown) => event,
  writeAuditEvent: vi.fn(),
  hashPayload: async (value: unknown) => `hash:${JSON.stringify(value)}`,
}));

import type { BrowserWindow } from "electron";
import { configureMcpIpc, registerMcpIpcHandlers } from "./mcp-ipc.js";

const ORIGIN = "https://app.example";
const CONFIG = {
  url: "https://mcp.example/rpc",
  headers: { Authorization: "Bearer test" },
};
let trustedWindow: BrowserWindow;

function makeWindow() {
  const mainFrame = { url: `${ORIGIN}/mcp/test/thread-1` };
  return {
    isDestroyed: () => false,
    webContents: { mainFrame },
  } as unknown as BrowserWindow;
}

function makeEvent(window: BrowserWindow, url = `${ORIGIN}/mcp/test/thread-1`) {
  const mainFrame = window.webContents.mainFrame;
  return {
    sender: window.webContents,
    senderFrame: url === `${ORIGIN}/mcp/test/thread-1` ? mainFrame : { url },
  };
}

function getHandler(name: string) {
  const handler = mocks.handlers.get(name);
  if (!handler) throw new Error(`Missing handler ${name}`);
  return handler;
}

describe("desktop MCP IPC approval boundary", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.showMessageBox.mockReset().mockResolvedValue({ response: 0 });
    mocks.listDesktopMcpTools
      .mockReset()
      .mockResolvedValue([{ name: "read_file" }]);
    mocks.callDesktopMcpTool.mockReset().mockResolvedValue({ content: [] });
    trustedWindow = makeWindow();
    configureMcpIpc(trustedWindow, ORIGIN);
    registerMcpIpcHandlers();
  });

  it("rejects another origin or route before showing consent", async () => {
    const window = trustedWindow;
    await expect(
      getHandler("mcp:list-tools")(
        makeEvent(window, "https://evil.example/mcp/test/x"),
        {
          config: CONFIG,
        },
      ),
    ).rejects.toThrow("trusted MCP test page");
    await expect(
      getHandler("mcp:tool-call")(makeEvent(window, `${ORIGIN}/chat`), {
        config: CONFIG,
        toolName: "read_file",
      }),
    ).rejects.toThrow("trusted MCP test page");
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(mocks.listDesktopMcpTools).not.toHaveBeenCalled();
  });

  it("requires per-session consent for each exact server configuration", async () => {
    const window = trustedWindow;
    const event = makeEvent(window);
    await expect(
      getHandler("mcp:list-tools")(event, { config: CONFIG }),
    ).resolves.toEqual([{ name: "read_file" }]);
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(mocks.showMessageBox.mock.calls[0]?.[1].detail).toContain(
      "DNS addresses are checked and pinned",
    );
    await getHandler("mcp:list-tools")(event, {
      config: { ...CONFIG, headers: { Authorization: "Bearer changed" } },
    });
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it("asks for each tool call and redacts secrets in the native review", async () => {
    const window = trustedWindow;
    const config = { ...CONFIG, url: "https://review.example/rpc" };
    await expect(
      getHandler("mcp:tool-call")(makeEvent(window), {
        config,
        toolName: "read_file",
        params: { path: "notes.txt", apiKey: "secret-value" },
      }),
    ).resolves.toEqual({ content: [] });
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
    expect(mocks.showMessageBox.mock.calls[0]?.[1].detail).not.toContain(
      "Bearer test",
    );
    expect(mocks.showMessageBox.mock.calls[1]?.[1].detail).toContain(
      '"apiKey":"[redacted]"',
    );
    expect(mocks.showMessageBox.mock.calls[1]?.[1].detail).not.toContain(
      "secret-value",
    );
    expect(mocks.callDesktopMcpTool).toHaveBeenCalledWith(config, "read_file", {
      path: "notes.txt",
      apiKey: "secret-value",
    });
  });

  it("never executes after a user cancels tool approval", async () => {
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 1 });
    const window = trustedWindow;
    await expect(
      getHandler("mcp:tool-call")(makeEvent(window), {
        config: { url: "https://cancel.example/rpc" },
        toolName: "read_file",
        params: { path: "notes.txt" },
      }),
    ).rejects.toThrow("not approved");
    expect(mocks.callDesktopMcpTool).not.toHaveBeenCalled();
  });

  it("blocks non-allowlisted tools before asking to execute", async () => {
    const window = trustedWindow;
    await expect(
      getHandler("mcp:tool-call")(makeEvent(window), {
        config: { url: "https://write.example/rpc" },
        toolName: "delete_file",
        params: {},
      }),
    ).rejects.toThrow("not allowed");
    expect(mocks.callDesktopMcpTool).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
  });
});
