import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  connectCount: 0,
  transportName: "",
  calledTools: [] as Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect(transport: { constructor: { name: string } }) {
      mockState.connectCount += 1;
      mockState.transportName = transport.constructor.name;
    }

    async listTools() {
      return {
        tools: [
          { name: "read_file", description: "read", inputSchema: {} },
          { name: "write_file", description: "write", inputSchema: {} },
        ],
      };
    }

    async callTool(input: {
      name: string;
      arguments: Record<string, unknown>;
    }) {
      mockState.calledTools.push(input);
      return {
        content: [{ type: "text", text: `remote:${input.arguments.path}` }],
      };
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
});
