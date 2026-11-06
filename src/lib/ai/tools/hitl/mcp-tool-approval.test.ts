import { describe, expect, it } from "vitest";
import { getMcpApprovalTokenKey, hashMcpToolApproval, mcpToolApprovalSchema } from "./mcp-tool-approval";

describe("MCP tool approval payload", () => {
  it("binds server identity, tool and canonical JSON arguments", () => {
    const first = mcpToolApprovalSchema.parse({ serverId: "00000000-0000-4000-8000-000000000001", serverName: "Local CRM", toolName: "update_record", payload: { id: "42", fields: { status: "active", region: "west" } } });
    const second = mcpToolApprovalSchema.parse({ serverId: "00000000-0000-4000-8000-000000000001", serverName: "Local CRM", toolName: "update_record", payload: { fields: { region: "west", status: "active" }, id: "42" } });
    expect(hashMcpToolApproval(first)).toBe(hashMcpToolApproval(second));
    expect(hashMcpToolApproval(first)).not.toBe(hashMcpToolApproval({ ...first, toolName: "delete_record" }));
  });

  it("bounds the server, tool and JSON payload", () => {
    expect(mcpToolApprovalSchema.safeParse({ serverId: "bad", serverName: "Local", toolName: "delete", payload: {} }).success).toBe(false);
    expect(mcpToolApprovalSchema.safeParse({ serverId: "00000000-0000-4000-8000-000000000001", serverName: "Local", toolName: "bad tool", payload: {} }).success).toBe(false);
    expect(mcpToolApprovalSchema.safeParse({ serverId: "00000000-0000-4000-8000-000000000001", serverName: "Local", toolName: "update", payload: { data: "x".repeat(16_001) } }).success).toBe(false);
  });

  it("chooses a token field that cannot shadow an MCP argument", () => {
    expect(getMcpApprovalTokenKey({ voidAgentApprovalToken: { type: "string" }, voidAgentApprovalToken_: { type: "number" } })).toBe("voidAgentApprovalToken__");
  });
});
