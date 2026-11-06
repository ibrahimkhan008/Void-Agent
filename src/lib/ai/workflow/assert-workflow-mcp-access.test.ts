import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selectAllForUser: vi.fn() }));
vi.mock("lib/db/repository", () => ({ mcpRepository: { selectAllForUser: mocks.selectAllForUser } }));
vi.mock("server-only", () => ({}));

import { assertWorkflowMcpAccess } from "./assert-workflow-mcp-access";

const graph = [{ kind: "tool", nodeConfig: { tool: { type: "mcp-tool", serverId: "server-1", serverName: "Calendar" } } }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectAllForUser.mockResolvedValue([{ id: "server-1", name: "Calendar", enabled: true }]);
});

describe("assertWorkflowMcpAccess", () => {
  it("allows the caller's accessible, enabled MCP connection", async () => {
    await expect(assertWorkflowMcpAccess("user-1", graph)).resolves.toBeUndefined();
    expect(mocks.selectAllForUser).toHaveBeenCalledWith("user-1");
  });

  it.each([
    [[], "private or missing server"],
    [[{ id: "server-1", name: "Calendar", enabled: false }], "disabled server"],
    [[{ id: "server-1", name: "Renamed", enabled: true }], "stale server identity"],
  ])("rejects %s", async (servers) => {
    mocks.selectAllForUser.mockResolvedValue(servers);
    await expect(assertWorkflowMcpAccess("user-1", graph)).rejects.toThrow(/MCP connection.*unavailable/i);
  });

  it("does not query MCP access for graphs without MCP nodes", async () => {
    await expect(assertWorkflowMcpAccess("user-1", [{ kind: "llm" }])).resolves.toBeUndefined();
    expect(mocks.selectAllForUser).not.toHaveBeenCalled();
  });
});
