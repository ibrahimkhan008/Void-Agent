import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { MCPServerConfig, MCPToolInfo } from "@keinsaas/mcp-types";

import { isMaybeRemoteConfig, isMaybeStdioConfig } from "@keinsaas/mcp-types";

import {
  assertDesktopMcpToolAllowed,
  filterAllowedDesktopMcpTools,
} from "@keinsaas/mcp-core/mcp-tool-policy";

import { hashPayload } from "./audit-sink.js";

import {
  MCP_DEFAULT_CALL_TIMEOUT_MS,
  MCP_DEFAULT_CONNECT_TIMEOUT_MS,
  buildStdioTransport,
  withTimeout,
} from "@keinsaas/mcp-router";

import { writeAuditEvent } from "./audit-sink.js";
import { stringifyBoundedJson } from "./bounded-json.js";
import { parseDesktopMcpConfig, parseDesktopToolCall } from "./mcp-policy.js";
import { recordDesktopError } from "./otel.js";
import { createPinnedRemoteMcpFetch } from "./pinned-remote-fetch.js";

const CONNECT_TIMEOUT_MS = MCP_DEFAULT_CONNECT_TIMEOUT_MS;
const MAX_RESULT_CHARS = 4 * 1024 * 1024;

function buildPinnedRemoteTransport(
  config: Extract<MCPServerConfig, { url: string }>,
  useSse: boolean,
): Transport {
  const url = new URL(config.url);
  const fetch = createPinnedRemoteMcpFetch(url.origin, config.headers ?? {});
  const requestInit = { headers: config.headers, redirect: "error" as const };
  return useSse
    ? new SSEClientTransport(url, { requestInit, fetch })
    : new StreamableHTTPClientTransport(url, { requestInit, fetch });
}

function boundResult<T>(value: T): T {
  const serialized = stringifyBoundedJson(value, MAX_RESULT_CHARS);
  return JSON.parse(serialized) as T;
}

async function connectClient(
  client: Client,
  config: MCPServerConfig,
): Promise<void> {
  if (isMaybeStdioConfig(config)) {
    const transport = buildStdioTransport(config, { remoteOnly: false });

    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS);

    return;
  }

  if (isMaybeRemoteConfig(config)) {
    try {
      const transport = buildPinnedRemoteTransport(config, false);

      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS);

      return;
    } catch {
      const transport = buildPinnedRemoteTransport(config, true);

      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS);

      return;
    }
  }

  throw new Error("Invalid MCP server config");
}

async function withConnectedClient<T>(
  config: MCPServerConfig,

  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    name: "keinsaas-navigator-desktop-mcp",

    version: "0.1.0",
  });

  try {
    await connectClient(client, config);

    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listDesktopMcpTools(
  configInput: MCPServerConfig,
): Promise<MCPToolInfo[]> {
  const config = parseDesktopMcpConfig(configInput);
  return withConnectedClient(config, async (client) => {
    const result = await withTimeout(
      client.listTools(),
      MCP_DEFAULT_CALL_TIMEOUT_MS,
    );

    return boundResult(
      filterAllowedDesktopMcpTools(result.tools).map(
        (tool) =>
          ({
            name: tool.name,

            description: tool.description,

            inputSchema: tool.inputSchema,
          }) as MCPToolInfo,
      ),
    );
  });
}

export async function callDesktopMcpTool(
  configInput: MCPServerConfig,
  toolNameInput: string,
  paramsInput: Record<string, unknown> = {},
): Promise<unknown> {
  const config = parseDesktopMcpConfig(configInput);
  const { toolName, params } = parseDesktopToolCall({
    toolName: toolNameInput,
    params: paramsInput,
  });
  assertDesktopMcpToolAllowed(toolName);

  const argsHash = await hashPayload(params);

  try {
    const rawResult = await withConnectedClient(config, async (client) =>
      withTimeout(
        client.callTool({ name: toolName, arguments: params }),
        MCP_DEFAULT_CALL_TIMEOUT_MS,
      ),
    );
    const result = boundResult(rawResult);

    const resultHash = await hashPayload(result);

    writeAuditEvent({
      action: "mcp.tool.call",

      resourceType: "mcp_tool",

      toolName,

      argsHash,

      resultHash,

      outcome: "success",
    });

    return result;
  } catch (error) {
    writeAuditEvent({
      action: "mcp.tool.call",

      resourceType: "mcp_tool",

      toolName,

      argsHash,

      outcome: "failure",
    });

    // The audit sink is local-only; this is what makes a local stdio MCP
    // failure visible to us at all.
    recordDesktopError("mcp.tool.call", error, { "mcp.tool.name": toolName });

    throw error;
  }
}
