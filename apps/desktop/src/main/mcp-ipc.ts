import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  app,
  dialog,
  ipcMain,
} from "electron";
import { readRecentDesktopMcpAuditEvents } from "./mcp-audit-log.js";
import { desktopMcpConfigSchema, desktopToolCallSchema } from "./mcp-policy.js";
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
  const config = desktopMcpConfigSchema.parse(configInput);
  const fingerprint = getMcpConfigFingerprint(config);
  if (consentedConfigs.has(fingerprint)) return config;
  const isRemote = "url" in config;
  const commandLabel = isRemote
    ? new URL(config.url).origin
    : [config.command, ...(config.args ?? [])].join(" ").slice(0, 700);
  const envNames = isRemote
    ? Object.keys(config.headers ?? {})
        .sort()
        .join(", ") || "none"
    : Object.keys(config.env ?? {})
        .sort()
        .join(", ") || "none";
  const result = await dialog.showMessageBox(trustedWindow!, {
    type: "warning",
    title: isRemote
      ? "Allow a remote MCP server?"
      : "Allow a local MCP process?",
    message: isRemote
      ? "Void-Agent wants to connect to a remote MCP service from this computer."
      : "Void-Agent wants to start a program on this computer.",
    detail: isRemote
      ? `HTTPS origin: ${commandLabel}\nCredential header names: ${envNames}\n\nThe remote service receives the displayed tool arguments and returns untrusted content. DNS addresses are checked and pinned for each connection; redirects are blocked. Only approved read-style tools are available. Continue only if you trust this origin and credentials.`
      : `Program: ${commandLabel}\nEnvironment variable names: ${envNames}\n\nThe process can access files and services available to your account. Tool names do not prove that a server is safe. Continue only if you trust this program and its configuration.`,
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
  resultHash?: string;
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
    ...(input.resultHash ? { resultHash: input.resultHash } : {}),
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
  ipcMain.handle("mcp:get-audit-history", async (event) => {
    assertTrustedMcpPage(event);
    return readRecentDesktopMcpAuditEvents(app.getPath("userData"));
  });

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
    const rawConfig = desktopMcpConfigSchema.parse(input?.config);
    const call = desktopToolCallSchema.parse({
      toolName: input?.toolName,
      params: input?.params ?? {},
    });
    // A tool invocation may arrive without a prior list-tools IPC call, or
    // with a changed executable/environment. Confirm and execute the exact
    // parsed config before showing the separate per-call consent dialog.
    const config = await confirmConfig(event, rawConfig);
    const isRemote = "url" in config;
    const destination = isRemote ? new URL(config.url).origin : undefined;
    const result = await dialog.showMessageBox(trustedWindow!, {
      type: "warning",
      title: isRemote
        ? "Send a remote MCP tool request?"
        : "Run a local MCP tool?",
      message: isRemote
        ? `Send “${call.toolName}” to ${destination}?`
        : `Ask the local MCP server to run “${call.toolName}”?`,
      detail: isRemote
        ? `The request sends these exact arguments to ${destination}; the server's response will be returned to ${trustedOrigin} as untrusted content. DNS addresses are checked and pinned, and redirects are blocked. Exact arguments (full JSON):\n${JSON.stringify(call.params, null, 2)}\n\nReview the destination and arguments before continuing.`
        : `This program can perform actions beyond what its tool name suggests. Exact arguments (full JSON):\n${JSON.stringify(call.params, null, 2)}\n\nIts result will be returned to ${trustedOrigin}. Review the command, server settings, and complete arguments in Void-Agent before continuing.`,
      buttons: [isRemote ? "Send request" : "Run tool", "Cancel"],
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
      throw new Error(
        isRemote
          ? "Remote MCP tool request was not approved"
          : "Local MCP tool call was not approved",
      );
    }
    try {
      const value = await callDesktopMcpTool(config, call);
      const resultHash = hashMcpAuditValue(value);
      await writeAudit({
        action: "mcp.tool-call",
        config,
        toolName: call.toolName,
        args: call.params,
        resultHash,
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
      throw new Error(
        isRemote ? "Remote MCP tool call failed" : "Local MCP tool call failed",
      );
    }
  });
}
