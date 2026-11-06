import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showMessageBox: vi.fn(),
  appendFile: vi.fn(),
  listDesktopMcpTools: vi.fn(),
  callDesktopMcpTool: vi.fn(),
  getMcpConfigFingerprint: vi.fn(),
  hashMcpAuditValue: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/void-agent-desktop-test" },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(name, handler),
  },
}));
vi.mock("node:fs/promises", () => ({ appendFile: mocks.appendFile }));
vi.mock("./mcp-spawner.js", () => ({
  callDesktopMcpTool: mocks.callDesktopMcpTool,
  getMcpConfigFingerprint: mocks.getMcpConfigFingerprint,
  hashMcpAuditValue: mocks.hashMcpAuditValue,
  listDesktopMcpTools: mocks.listDesktopMcpTools,
}));

import type { BrowserWindow } from "electron";
import { configureMcpIpc, registerMcpIpcHandlers } from "./mcp-ipc.js";

const origin = "https://void-agent.example";
const config = {
  command: "node",
  args: ["server.js"],
  env: { API_KEY: "secret" },
};
const call = { toolName: "read_file", params: { path: "notes.txt" } };

function setup() {
  const mainFrame = { url: `${origin}/mcp/test/server-1` };
  const webContents = { mainFrame };
  const window = {
    webContents,
    isDestroyed: () => false,
  } as unknown as BrowserWindow;
  const event = {
    sender: webContents,
    senderFrame: mainFrame,
  };
  configureMcpIpc(window, origin);
  registerMcpIpcHandlers();
  return {
    event,
    callTool: mocks.handlers.get("mcp:tool-call")!,
    listTools: mocks.handlers.get("mcp:list-tools")!,
  };
}

describe("desktop MCP IPC config consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    mocks.appendFile.mockResolvedValue(undefined);
    mocks.getMcpConfigFingerprint.mockImplementation((value) =>
      JSON.stringify(value),
    );
    mocks.hashMcpAuditValue.mockReturnValue("audit-hash");
    mocks.listDesktopMcpTools.mockResolvedValue([]);
    mocks.callDesktopMcpTool.mockResolvedValue({
      content: [{ type: "text", text: "read result" }],
    });
  });

  it("confirms the exact executable config before tool-call consent and execution", async () => {
    const { event, callTool } = setup();
    const result = await callTool(event, { config, ...call });

    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
    expect(mocks.showMessageBox.mock.calls[0]?.[1]).toMatchObject({
      title: "Allow a local MCP process?",
      detail: expect.stringContaining("Program: node server.js"),
    });
    expect(mocks.showMessageBox.mock.calls[0]?.[1].detail).toContain(
      "Environment variable names: API_KEY",
    );
    expect(mocks.showMessageBox.mock.calls[1]?.[1]).toMatchObject({
      title: "Run a local MCP tool?",
    });
    expect(mocks.callDesktopMcpTool).toHaveBeenCalledWith(config, call);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "read result" }],
    });
  });

  it("requires new process consent when the executable config changes after listing", async () => {
    const { event, listTools, callTool } = setup();
    const listedConfig = {
      command: "node-listing-test",
      args: ["initial.js"],
    };
    const changedConfig = { command: "python", args: ["mcp_server.py"] };

    await listTools(event, { config: listedConfig });
    await callTool(event, { config: changedConfig, ...call });

    expect(mocks.showMessageBox).toHaveBeenCalledTimes(3);
    expect(mocks.showMessageBox.mock.calls[1]?.[1]).toMatchObject({
      title: "Allow a local MCP process?",
      detail: expect.stringContaining("Program: python mcp_server.py"),
    });
    expect(mocks.callDesktopMcpTool).toHaveBeenCalledWith(changedConfig, call);
  });

  it("does not execute or request tool consent when process consent is denied", async () => {
    const { event, callTool } = setup();
    const unapprovedConfig = { command: "never-approved-process" };
    mocks.showMessageBox.mockResolvedValueOnce({ response: 1 });

    await expect(
      callTool(event, { config: unapprovedConfig, ...call }),
    ).rejects.toThrow("Local MCP process was not approved");
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(mocks.callDesktopMcpTool).not.toHaveBeenCalled();
  });

  it("rejects IPC from a different sender before showing consent", async () => {
    const { callTool } = setup();
    const untrustedEvent = {
      sender: {},
      senderFrame: { url: `${origin}/mcp/test/server-1` },
    };

    await expect(callTool(untrustedEvent, { config, ...call })).rejects.toThrow(
      "Untrusted desktop IPC sender",
    );
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(mocks.callDesktopMcpTool).not.toHaveBeenCalled();
  });
});
