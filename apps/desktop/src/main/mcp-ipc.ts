import type { MCPServerConfig } from "@keinsaas/mcp-types";
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  dialog,
  ipcMain,
} from "electron";
import { parseAuditEvent, writeAuditEvent } from "./audit-sink.js";
import { hashPayload } from "./audit-sink.js";
import { stringifyBoundedJson } from "./bounded-json.js";
import {
  fingerprintDesktopMcpConfig,
  formatLocalMcpCommandForReview,
  isTrustedMcpPage,
  parseDesktopMcpConfig,
  parseDesktopToolCall,
  redactDesktopMcpReviewValue,
} from "./mcp-policy.js";
import { callDesktopMcpTool, listDesktopMcpTools } from "./mcp-spawner.js";

const MAX_CONFIG_CONSENTS = 256;
const consentedConfigHashes = new Set<string>();
let trustedWindow: BrowserWindow | null = null;
let trustedOrigin = "";

export function configureMcpIpc(
  window: BrowserWindow | null,
  appOrigin: string,
): void {
  trustedWindow = window;
  trustedOrigin = appOrigin;
}

function assertTrustedMcpPage(event: IpcMainInvokeEvent): void {
  const window = trustedWindow;
  if (
    !isTrustedMcpPage({
      hasWindow: Boolean(window),
      windowDestroyed: !window || window.isDestroyed(),
      senderMatches: Boolean(window) && event.sender === window?.webContents,
      mainFrameMatches:
        Boolean(window) && event.senderFrame === window?.webContents.mainFrame,
      frameUrl: event.senderFrame?.url ?? "",
      appOrigin: trustedOrigin,
    })
  ) {
    throw new Error(
      "Desktop MCP is available only from the trusted MCP test page",
    );
  }
}

function rememberConsent(fingerprint: string): void {
  consentedConfigHashes.add(fingerprint);
  while (consentedConfigHashes.size > MAX_CONFIG_CONSENTS) {
    const oldest = consentedConfigHashes.values().next().value as
      | string
      | undefined;
    if (!oldest) break;
    consentedConfigHashes.delete(oldest);
  }
}

async function auditMcp(input: {
  action: "mcp.desktop.list-tools" | "mcp.desktop.tool-call";
  configHash?: string;
  toolName?: string;
  argsHash?: string;
  resultHash?: string;
  outcome: "success" | "denied" | "failure";
}): Promise<void> {
  try {
    writeAuditEvent({
      action: input.action,
      resourceType: "mcp_server",
      ...(input.configHash ? { resourceId: input.configHash } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.argsHash ? { argsHash: input.argsHash } : {}),
      ...(input.resultHash ? { resultHash: input.resultHash } : {}),
      outcome: input.outcome,
    });
  } catch {
    // Audit failure must not turn a denied action into an allowed one or expose data.
  }
}

async function confirmConfig(
  event: IpcMainInvokeEvent,
  configInput: unknown,
): Promise<MCPServerConfig> {
  assertTrustedMcpPage(event);
  const config = parseDesktopMcpConfig(configInput);
  const fingerprint = fingerprintDesktopMcpConfig(config);
  if (consentedConfigHashes.has(fingerprint)) return config;

  const isRemote = "url" in config;
  const target = isRemote
    ? new URL(config.url).origin
    : formatLocalMcpCommandForReview(config);
  const credentialNames = isRemote
    ? Object.keys(config.headers ?? {})
        .sort()
        .join(", ") || "none"
    : Object.keys(config.env ?? {})
        .sort()
        .join(", ") || "none";
  const response = await dialog.showMessageBox(trustedWindow!, {
    type: "warning",
    title: isRemote
      ? "Allow a remote MCP server?"
      : "Allow a local MCP process?",
    message: isRemote
      ? "Void Agent wants to connect to a remote MCP service from this computer."
      : "Void Agent wants to start a program on this computer.",
    detail: isRemote
      ? `HTTPS origin: ${target}\nCredential header names: ${credentialNames}\n\nThe server receives approved read-style tool arguments and returns untrusted content. DNS addresses are checked and pinned for every request, redirects are blocked, and each invocation needs separate approval.`
      : `Program and arguments: ${target}\nEnvironment variable names: ${credentialNames}\n\nThe process can access files and services available to your account. Tool names do not prove that a server is safe. Each invocation needs separate approval.`,
    buttons: ["Allow for this app session", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response.response !== 0) {
    await auditMcp({
      action: "mcp.desktop.list-tools",
      configHash: fingerprint,
      outcome: "denied",
    });
    throw new Error("MCP server was not approved");
  }
  rememberConsent(fingerprint);
  return config;
}

export function registerMcpIpcHandlers(): void {
  ipcMain.handle("mcp:list-tools", async (event, payload: unknown) => {
    assertTrustedMcpPage(event);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid MCP request");
    }
    const config = await confirmConfig(
      event,
      (payload as { config?: unknown }).config,
    );
    const fingerprint = fingerprintDesktopMcpConfig(config);
    try {
      const tools = await listDesktopMcpTools(config);
      await auditMcp({
        action: "mcp.desktop.list-tools",
        configHash: fingerprint,
        outcome: "success",
      });
      return tools;
    } catch {
      await auditMcp({
        action: "mcp.desktop.list-tools",
        configHash: fingerprint,
        outcome: "failure",
      });
      throw new Error("Could not list tools for this MCP server");
    }
  });

  ipcMain.handle("mcp:tool-call", async (event, payload: unknown) => {
    assertTrustedMcpPage(event);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid MCP request");
    }
    const input = payload as Record<string, unknown>;
    const config = await confirmConfig(event, input.config);
    const call = parseDesktopToolCall({
      toolName: input.toolName,
      params: input.params ?? {},
    });
    const fingerprint = fingerprintDesktopMcpConfig(config);
    const argsHash = await hashPayload(call.params);
    const target =
      "url" in config
        ? new URL(config.url).origin
        : "the approved local MCP process";
    const safeParams = stringifyBoundedJson(
      redactDesktopMcpReviewValue(call.params),
      32_768,
    );
    const response = await dialog.showMessageBox(trustedWindow!, {
      type: "warning",
      title: "Approve MCP tool request?",
      message: `Send “${call.toolName}” to ${target}?`,
      detail: `Review the arguments before continuing. Secrets in credential-shaped fields are hidden.\n\nArguments:\n${safeParams}`,
      buttons: ["Approve this request", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response.response !== 0) {
      await auditMcp({
        action: "mcp.desktop.tool-call",
        configHash: fingerprint,
        toolName: call.toolName,
        argsHash,
        outcome: "denied",
      });
      throw new Error("MCP tool call was not approved");
    }
    try {
      const result = await callDesktopMcpTool(
        config,
        call.toolName,
        call.params,
      );
      const resultHash = await hashPayload(result);
      await auditMcp({
        action: "mcp.desktop.tool-call",
        configHash: fingerprint,
        toolName: call.toolName,
        argsHash,
        resultHash,
        outcome: "success",
      });
      return result;
    } catch {
      await auditMcp({
        action: "mcp.desktop.tool-call",
        configHash: fingerprint,
        toolName: call.toolName,
        argsHash,
        outcome: "failure",
      });
      throw new Error("MCP tool call failed");
    }
  });

  ipcMain.handle("audit:log", async (_event, payload: unknown) => {
    const event = parseAuditEvent(payload);
    writeAuditEvent(event);
    return { ok: true };
  });
}
