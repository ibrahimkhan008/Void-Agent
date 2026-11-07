import { describe, expect, it } from "vitest";
import { callDesktopMcpTool, listDesktopMcpTools } from "./mcp-spawner.js";

const serverScript = `
  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import { z } from "zod";
  const server = new McpServer({ name: "test-local-mcp", version: "1.0.0" });
  server.tool("read_file", "Read a test file", { path: z.string() }, async ({ path }) => ({ content: [{ type: "text", text: "read:" + path }] }));
  server.tool("list_tools", "Return local tool metadata", {}, async () => ({ content: [{ type: "text", text: "tool metadata" }] }));
  server.tool("write_file", "Write a test file", { path: z.string() }, async ({ path }) => ({ content: [{ type: "text", text: "write:" + path }] }));
  await server.connect(new StdioServerTransport());
`;

const config = {
  command: process.execPath,
  args: ["--input-type=module", "-e", serverScript],
};

describe("desktop local MCP process", () => {
  it("lists only approved read tools from a spawned stdio server", async () => {
    const tools = await listDesktopMcpTools(config);
    expect(tools.map((tool) => tool.name)).toEqual(["read_file", "list_tools"]);
  }, 20_000);

  it("executes an approved tool and rejects a write tool before execution", async () => {
    const result = await callDesktopMcpTool(config, {
      toolName: "read_file",
      params: { path: "notes.txt" },
    });
    expect(result).toMatchObject({
      content: [{ type: "text", text: "read:notes.txt" }],
    });
    await expect(
      callDesktopMcpTool(config, {
        toolName: "write_file",
        params: { path: "notes.txt" },
      }),
    ).rejects.toThrow("read-only policy");
  }, 20_000);
});
