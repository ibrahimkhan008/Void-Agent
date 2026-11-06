import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  app,
  dialog,
  ipcMain,
} from "electron";
import {
  desktopStdioConfigSchema,
  desktopToolCallSchema,
} from "./mcp-policy.js";
import {
  callDesktopMcpTool,
  getMcpConfigFingerprint,
  hashMcpAuditValue,
  listDesktopMcpTools,
} from "./mcp-spawner.js";

let trustedWindow: BrowserWindow | null = null;
let trustedOrigin = "";
const consentedConfigs = new Set<string>();

export function configureMcpIpc(window: BrowserWindow, appOrigin: string) {
  trustedWindow = window;
  trustedOrigin = appOrigin;
}

function assertTrustedMcpPage(event: IpcMainInvokeEvent) {
  if (
    !trustedWindow ||
    trustedWindow.isDestroyed() ||
    event.sender !== trustedWindow.webContents ||
    event.senderFrame !== trustedWindow.webContents.mainFrame
  ) {
    throw new Error("Untrusted desktop IPC sender");
  }
  let url: URL;
  try {
    url = new URL(event.senderFrame.url);
  } catch {
    throw new Error("Invalid desktop IPC origin");
  }
  if (
    url.origin !== trustedOrigin ||
    !/^\/mcp\/test\/[^/]+\/?$/.test(url.pathname)
  )
    throw new Error(
      "Desktop MCP is available only from the Void-Agent MCP test screen",
    );
}

async function confirmConfig(event: IpcMainInvokeEvent, configInput: unknown) {
  assertTrustedMcpPage(event);
  const config = desktopStdioConfigSchema.parse(configInput);
  const fingerprint = getMcpConfigFingerprint(config);
  if (consentedConfigs.has(fingerprint)) return config;
  const commandLabel = [config.command, ...(config.args ?? [])]
    .join(" ")
    .slice(0, 700);
  const envNames =
    Object.keys(config.env ?? {})
      .sort()
      .join(", ") || "none";
  const result = await dialog.showMessageBox(trustedWindow!, {
    type: "warning",
    title: "Allow a local MCP process?",
    message: "Void-Agent wants to start a program on this computer.",
    detail: `Program: ${commandLabel}\nEnvironment variable names: ${envNames}\n\nThe process can access files and services available to your account. Tool names do not prove that a server is safe. Continue only if you trust this program and its configuration.`,
    buttons: ["Allow for this app session", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0)
    throw new Error("Local MCP process was not approved");
  consentedConfigs.add(fingerprint);
  return config;
}

async function writeAudit(input: {
  action: string;
  config: unknown;
  toolName?: string;
  args?: unknown;
  outcome: "success" | "denied" | "failure";
}) {
  const event = {
    timestamp: new Date().toISOString(),
    surface: "desktop",
    action: input.action,
    configHash: hashMcpAuditValue(input.config),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.args !== undefined
      ? { argsHash: hashMcpAuditValue(input.args) }
      : {}),
    outcome: input.outcome,
  };
  try {
    await appendFile(
      join(app.getPath("userData"), "mcp-audit.ndjson"),
      `${JSON.stringify(event)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    /* auditing failure must not leak raw payloads or change the result */
  }
}

export function registerMcpIpcHandlers() {
  ipcMain.handle("mcp:list-tools", async (event, payload: unknown) => {
    const configInput = (payload as { config?: unknown } | null)?.config;
    try {
      const config = await confirmConfig(event, configInput);
      const tools = await listDesktopMcpTools(config);
      await writeAudit({
        action: "mcp.list-tools",
        config,
        outcome: "success",
      });
      return tools;
    } catch {
      await writeAudit({
        action: "mcp.list-tools",
        config: configInput,
        outcome: "denied",
      });
      throw new Error("Could not list tools for this local MCP server");
    }
  });

  ipcMain.handle("mcp:tool-call", async (event, payload: unknown) => {
    assertTrustedMcpPage(event);
    const input = payload as {
      config?: unknown;
      toolName?: unknown;
      params?: unknown;
    } | null;
    const rawConfig = desktopStdioConfigSchema.parse(input?.config);
    const call = desktopToolCallSchema.parse({
      toolName: input?.toolName,
      params: input?.params ?? {},
    });
    // A tool invocation may arrive without a prior list-tools IPC call, or
    // with a changed executable/environment. Confirm and execute the exact
    // parsed config before showing the separate per-call consent dialog.
    const config = await confirmConfig(event, rawConfig);
    const result = await dialog.showMessageBox(trustedWindow!, {
      type: "warning",
      title: "Run a local MCP tool?",
      message: `Ask the local MCP server to run “${call.toolName}”?`,
      detail: `This program can perform actions beyond what its tool name suggests. Arguments: ${JSON.stringify(call.params).slice(0, 3_000)}\n\nIts result will be returned to ${trustedOrigin}. Review the command, server settings, and arguments in Void-Agent before continuing.`,
      buttons: ["Run tool", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) {
      await writeAudit({
        action: "mcp.tool-call",
        config,
        toolName: call.toolName,
        args: call.params,
        outcome: "denied",
      });
      throw new Error("Local MCP tool call was not approved");
    }
    try {
      const value = await callDesktopMcpTool(config, call);
      await writeAudit({
        action: "mcp.tool-call",
        config,
        toolName: call.toolName,
        args: call.params,
        outcome: "success",
      });
      return value;
    } catch {
      await writeAudit({
        action: "mcp.tool-call",
        config,
        toolName: call.toolName,
        args: call.params,
        outcome: "failure",
      });
      throw new Error("Local MCP tool call failed");
    }
  });
}
