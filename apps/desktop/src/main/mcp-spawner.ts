import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildMcpConfigFingerprint, desktopStdioConfigSchema, desktopToolCallSchema, isDesktopMcpToolAllowed } from "./mcp-policy.js";

const CONNECT_TIMEOUT_MS = 12_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 1_000_000;
const BASE_ENV_KEYS = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "COMSPEC", "TEMP", "TMP", "LANG"];

export type DesktopMcpConfig = { command: string; args?: string[]; env?: Record<string, string> };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function buildChildEnvironment(config: DesktopMcpConfig) {
  const result: Record<string, string> = {};
  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value) result[key] = value;
  }
  return { ...result, ...(config.env ?? {}) };
}

async function withConnectedClient<T>(configInput: unknown, run: (client: Client) => Promise<T>, operationTimeoutMs: number) {
  const config = desktopStdioConfigSchema.parse(configInput);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: buildChildEnvironment(config),
    stderr: "pipe",
  });
  const client = new Client({ name: "void-agent-desktop-mcp", version: "0.1.0" });
  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "MCP server connection timed out");
    return await withTimeout(run(client), operationTimeoutMs, "MCP operation timed out");
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

export async function listDesktopMcpTools(configInput: unknown) {
  const config = desktopStdioConfigSchema.parse(configInput);
  const tools = await withConnectedClient(config, async (client) => (await client.listTools()).tools, CONNECT_TIMEOUT_MS);
  return tools.filter((tool) => isDesktopMcpToolAllowed(tool.name)).slice(0, 100).map((tool) => {
    const description = typeof tool.description === "string" ? tool.description.slice(0, 4_000) : "";
    let inputSchema: unknown = tool.inputSchema;
    if (JSON.stringify(inputSchema ?? null).length > 32_000) inputSchema = { type: "object", properties: {}, description: "Input schema omitted because it exceeded the desktop display limit." };
    return { name: tool.name, description, inputSchema };
  });
}

export async function callDesktopMcpTool(configInput: unknown, callInput: unknown) {
  const config = desktopStdioConfigSchema.parse(configInput);
  const call = desktopToolCallSchema.parse(callInput);
  if (!isDesktopMcpToolAllowed(call.toolName)) throw new Error("This local MCP tool is not allowed by Void-Agent's read-only desktop policy");
  const result = await withConnectedClient(config, (client) => client.callTool({ name: call.toolName, arguments: call.params }), CALL_TIMEOUT_MS);
  const serialized = JSON.stringify(result ?? null);
  if (serialized.length > MAX_RESULT_CHARS) throw new Error("MCP result exceeded the desktop display limit");
  return JSON.parse(serialized) as unknown;
}

export function hashMcpAuditValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export function getMcpConfigFingerprint(configInput: unknown) {
  return buildMcpConfigFingerprint(desktopStdioConfigSchema.parse(configInput));
}
