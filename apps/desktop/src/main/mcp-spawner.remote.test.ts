import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  connectCount: 0,
  transportName: "",
  calledTools: [] as Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>,
  listedTools: [
    { name: "read_file", description: "read", inputSchema: {} },
    { name: "write_file", description: "write", inputSchema: {} },
  ] as Array<Record<string, unknown>>,
  toolResult: {
    content: [{ type: "text", text: "remote:notes.txt" }],
  } as unknown,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect(transport: { constructor: { name: string } }) {
      mockState.connectCount += 1;
      mockState.transportName = transport.constructor.name;
    }

    async listTools() {
      return { tools: mockState.listedTools };
    }

    async callTool(input: {
      name: string;
      arguments: Record<string, unknown>;
    }) {
      mockState.calledTools.push(input);
      return mockState.toolResult;
    }

    async close() {}
  },
}));

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDesktopMcpOperations } from "./mcp-spawner.js";

describe("desktop remote MCP operations", () => {
  const config = {
    url: "https://mcp.example.test/api/mcp",
    headers: { Authorization: "Bearer local-test-token" },
  };
  const fetchFactory = vi.fn(() => async () => {
    throw new Error("The mocked client must not issue a network request");
  });
  const operations = createDesktopMcpOperations(fetchFactory);

  beforeEach(() => {
    mockState.connectCount = 0;
    mockState.transportName = "";
    mockState.calledTools = [];
    mockState.listedTools = [
      { name: "read_file", description: "read", inputSchema: {} },
      { name: "write_file", description: "write", inputSchema: {} },
    ];
    mockState.toolResult = {
      content: [{ type: "text", text: "remote:notes.txt" }],
    };
    fetchFactory.mockClear();
  });

  it("lists allowlisted tools through the remote configuration path", async () => {
    const tools = await operations.listTools(config);
    expect(tools.map(({ name }) => name)).toEqual(["read_file"]);
    expect(mockState.connectCount).toBe(1);
    expect(mockState.transportName).toBe(StreamableHTTPClientTransport.name);
    expect(fetchFactory).toHaveBeenCalledWith(
      "https://mcp.example.test",
      config.headers,
    );
  });

  it("calls an allowed remote tool and rejects a mutating tool", async () => {
    const result = await operations.callTool(config, {
      toolName: "read_file",
      params: { path: "notes.txt" },
    });
    expect(result).toMatchObject({
      content: [{ type: "text", text: "remote:notes.txt" }],
    });
    expect(mockState.calledTools).toEqual([
      { name: "read_file", arguments: { path: "notes.txt" } },
    ]);
    await expect(
      operations.callTool(config, {
        toolName: "write_file",
        params: { path: "notes.txt" },
      }),
    ).rejects.toThrow("read-only policy");
    expect(mockState.calledTools).toHaveLength(1);
  });

  it("rejects insecure remote config before connecting", async () => {
    await expect(
      operations.listTools({ url: "http://mcp.example.test/api/mcp" }),
    ).rejects.toThrow();
    expect(mockState.connectCount).toBe(0);
  });

  it("rejects an oversized tool result while performing bounded serialization", async () => {
    mockState.toolResult = {
      content: [{ type: "text", text: "x".repeat(1_000_001) }],
    };
    await expect(
      operations.callTool(config, {
        toolName: "read_file",
        params: { path: "large.txt" },
      }),
    ).rejects.toThrow("MCP result exceeded the desktop display limit");
  });

  it("omits an oversized remote input schema without serializing it unboundedly", async () => {
    mockState.listedTools = [
      {
        name: "read_file",
        description: "read",
        inputSchema: { description: "x".repeat(40_000) },
      },
    ];
    const tools = await operations.listTools(config);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.inputSchema).toMatchObject({
      type: "object",
      properties: {},
    });
    expect(JSON.stringify(tools[0]?.inputSchema)).toContain(
      "exceeded the desktop display limit",
    );
  });
});
