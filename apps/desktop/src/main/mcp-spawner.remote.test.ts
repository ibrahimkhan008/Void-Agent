import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  pinnedFetch: vi.fn(),
  transports: [] as Array<{
    kind: "streamable" | "sse";
    url: URL;
    options: Record<string, unknown>;
  }>,
  writeAuditEvent: vi.fn(),
  recordDesktopError: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.close;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(url: URL, options: Record<string, unknown>) {
      mocks.transports.push({ kind: "streamable", url, options });
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class {
    constructor(url: URL, options: Record<string, unknown>) {
      mocks.transports.push({ kind: "sse", url, options });
    }
  },
}));

vi.mock("./pinned-remote-fetch.js", () => ({
  createPinnedRemoteMcpFetch: (...args: unknown[]) => {
    mocks.pinnedFetch(...args);
    return mocks.pinnedFetch;
  },
}));

vi.mock("./audit-sink.js", () => ({
  hashPayload: vi.fn(async () => "digest"),
  writeAuditEvent: mocks.writeAuditEvent,
}));

vi.mock("./otel.js", () => ({
  recordDesktopError: mocks.recordDesktopError,
}));

import { MCP_DEFAULT_CALL_TIMEOUT_MS } from "@keinsaas/mcp-router";
import { callDesktopMcpTool, listDesktopMcpTools } from "./mcp-spawner.js";

const config = {
  url: "https://mcp.example/rpc",
  headers: { Authorization: "Bearer test-secret" },
};

describe("desktop MCP remote transport integration", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.transports.length = 0;
    mocks.connect.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue({
      tools: [
        { name: "read_file", description: "Read a file", inputSchema: {} },
        { name: "write_file", description: "Write a file", inputSchema: {} },
      ],
    });
    mocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: "safe result" }],
    });
    mocks.close.mockResolvedValue(undefined);
  });

  it("injects pinned, redirect-blocking fetch into Streamable HTTP and filters tools", async () => {
    await expect(listDesktopMcpTools(config)).resolves.toEqual([
      { name: "read_file", description: "Read a file", inputSchema: {} },
    ]);

    expect(mocks.transports).toHaveLength(1);
    expect(mocks.transports[0]).toMatchObject({
      kind: "streamable",
      url: new URL(config.url),
      options: {
        fetch: mocks.pinnedFetch,
        requestInit: {
          headers: config.headers,
          redirect: "error",
        },
      },
    });
    expect(mocks.pinnedFetch).toHaveBeenCalledWith(
      "https://mcp.example",
      config.headers,
    );
  });

  it("uses the same pinned fetch and request policy for SSE fallback", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("streamable unavailable"));

    await expect(listDesktopMcpTools(config)).resolves.toHaveLength(1);

    expect(mocks.transports.map(({ kind }) => kind)).toEqual([
      "streamable",
      "sse",
    ]);
    for (const transport of mocks.transports) {
      expect(transport.options).toMatchObject({
        fetch: mocks.pinnedFetch,
        requestInit: {
          headers: config.headers,
          redirect: "error",
        },
      });
    }
  });

  it("bounds tool calls with the shared MCP call timeout and audits the result", async () => {
    await expect(
      callDesktopMcpTool(config, "read_file", { path: "notes.txt" }),
    ).resolves.toEqual({ content: [{ type: "text", text: "safe result" }] });

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "read_file",
      arguments: { path: "notes.txt" },
    });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mcp.tool.call", outcome: "success" }),
    );

    mocks.callTool.mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers();
    const pending = callDesktopMcpTool(config, "read_file", { path: "slow" });
    const rejected = expect(pending).rejects.toThrow("Timeout");
    await vi.advanceTimersByTimeAsync(MCP_DEFAULT_CALL_TIMEOUT_MS);
    await rejected;
  });
});
