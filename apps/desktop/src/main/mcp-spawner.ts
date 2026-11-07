import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  buildMcpConfigFingerprint,
  desktopMcpConfigSchema,
  desktopRemoteMcpConfigSchema,
  desktopToolCallSchema,
  isDesktopMcpToolAllowed,
} from "./mcp-policy.js";
import {
  createPinnedRemoteMcpFetch,
  getRemoteMcpOrigin,
} from "./pinned-remote-fetch.js";

type RemoteFetchFactory = (
  approvedOrigin: string,
  headers: Record<string, string>,
) => FetchLike;

const CONNECT_TIMEOUT_MS = 12_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 1_000_000;
const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "SYSTEMROOT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "LANG",
];

export type DesktopMcpConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string; headers?: Record<string, string> };

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function buildChildEnvironment(
  config: Extract<DesktopMcpConfig, { command: string }>,
) {
  const result: Record<string, string> = {};
  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value) result[key] = value;
  }
  return { ...result, ...(config.env ?? {}) };
}

async function withConnectedClient<T>(
  configInput: unknown,
  run: (client: Client) => Promise<T>,
  operationTimeoutMs: number,
  remoteFetchFactory: RemoteFetchFactory = createPinnedRemoteMcpFetch,
) {
  const config = desktopMcpConfigSchema.parse(configInput);
  const client = new Client({
    name: "void-agent-desktop-mcp",
    version: "0.1.0",
  });
  try {
    if ("command" in config) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: buildChildEnvironment(config),
        stderr: "pipe",
      });
      try {
        await withTimeout(
          client.connect(transport),
          CONNECT_TIMEOUT_MS,
          "MCP server connection timed out",
        );
        return await withTimeout(
          run(client),
          operationTimeoutMs,
          "MCP operation timed out",
        );
      } finally {
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
      }
    }
    const remote = desktopRemoteMcpConfigSchema.parse(config);
    const origin = getRemoteMcpOrigin(remote);
    const safeFetch = remoteFetchFactory(origin, remote.headers ?? {});
    const requestInit = { redirect: "error" as const };
    let connected = false;
    try {
      await withTimeout(
        client.connect(
          new StreamableHTTPClientTransport(new URL(remote.url), {
            fetch: safeFetch,
            requestInit,
            reconnectionOptions: {
              initialReconnectionDelay: 500,
              maxReconnectionDelay: 2_000,
              reconnectionDelayGrowFactor: 1.5,
              maxRetries: 2,
            },
          }),
        ),
        CONNECT_TIMEOUT_MS,
        "MCP server connection timed out",
      );
      connected = true;
    } catch {
      // Some legacy servers support only SSE; the same pinned fetch/origin
      // boundary applies to event-stream and POST requests.
      await withTimeout(
        client.connect(
          new SSEClientTransport(new URL(remote.url), {
            fetch: safeFetch,
            requestInit,
            eventSourceInit: { fetch: safeFetch },
          }),
        ),
        CONNECT_TIMEOUT_MS,
        "MCP server connection timed out",
      );
      connected = true;
    }
    if (!connected) throw new Error("MCP connection failed");
    return await withTimeout(
      run(client),
      operationTimeoutMs,
      "MCP operation timed out",
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function createDesktopMcpOperations(
  remoteFetchFactory: RemoteFetchFactory = createPinnedRemoteMcpFetch,
) {
  return {
    async listTools(configInput: unknown) {
      const config = desktopMcpConfigSchema.parse(configInput);
      const tools = await withConnectedClient(
        config,
        async (client) => (await client.listTools()).tools,
        CONNECT_TIMEOUT_MS,
        remoteFetchFactory,
      );
      return tools
        .filter((tool) => isDesktopMcpToolAllowed(tool.name))
        .slice(0, 100)
        .map((tool) => {
          const description =
            typeof tool.description === "string"
              ? tool.description.slice(0, 4_000)
              : "";
          let inputSchema: unknown = tool.inputSchema;
          if (JSON.stringify(inputSchema ?? null).length > 32_000)
            inputSchema = {
              type: "object",
              properties: {},
              description:
                "Input schema omitted because it exceeded the desktop display limit.",
            };
          return { name: tool.name, description, inputSchema };
        });
    },
    async callTool(configInput: unknown, callInput: unknown) {
      const config = desktopMcpConfigSchema.parse(configInput);
      const call = desktopToolCallSchema.parse(callInput);
      if (!isDesktopMcpToolAllowed(call.toolName))
        throw new Error(
          "This desktop MCP tool is not allowed by Void-Agent's read-only policy",
        );
      const result = await withConnectedClient(
        config,
        (client) =>
          client.callTool({ name: call.toolName, arguments: call.params }),
        CALL_TIMEOUT_MS,
        remoteFetchFactory,
      );
      const serialized = JSON.stringify(result ?? null);
      if (serialized.length > MAX_RESULT_CHARS)
        throw new Error("MCP result exceeded the desktop display limit");
      return JSON.parse(serialized) as unknown;
    },
  };
}

const desktopMcpOperations = createDesktopMcpOperations();

export const listDesktopMcpTools = desktopMcpOperations.listTools;
export const callDesktopMcpTool = desktopMcpOperations.callTool;

export function hashMcpAuditValue(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}

export function getMcpConfigFingerprint(configInput: unknown) {
  return buildMcpConfigFingerprint(desktopMcpConfigSchema.parse(configInput));
}
