import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("lib/db/pg/repositories/mcp-tool-approval-repository.pg", () => ({ mcpToolApprovalRepository: { consume: mocks.consume } }));
vi.mock("server-only", () => ({}));

import { executeApprovedMcpTool } from "./execute-approved-mcp-tool";

const approvalPayload = { serverId: "00000000-0000-4000-8000-000000000001", serverName: "CRM", toolName: "update_record", payload: { id: "42" } };

beforeEach(() => { vi.clearAllMocks(); mocks.consume.mockResolvedValue(false); });

describe("executeApprovedMcpTool", () => {
  it("fails closed without a token or authenticated user", async () => {
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await executeApprovedMcpTool({ userId: undefined, token: undefined, approvalPayload, execute });
    expect(result).toMatchObject({ isError: true, error: { name: "ApprovalRequired" } });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("never calls the MCP server when approval is stale or mismatched", async () => {
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await executeApprovedMcpTool({ userId: "user-1", token: "t".repeat(48), approvalPayload, execute });
    expect(result).toMatchObject({ isError: true, error: { name: "ApprovalRequired" } });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "t".repeat(48), approvalPayload);
    expect(execute).not.toHaveBeenCalled();
  });

  it("consumes the exact approval before calling the MCP server", async () => {
    mocks.consume.mockResolvedValue(true);
    const execute = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "done" }] });
    const result = await executeApprovedMcpTool({ userId: "user-1", token: "t".repeat(48), approvalPayload, execute });
    expect(result).toEqual({ content: [{ type: "text", text: "done" }] });
    expect(execute).toHaveBeenCalledOnce();
  });
});
