import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  selectAgent: vi.fn(),
  checkAgentAccess: vi.fn(),
  selectServer: vi.fn(),
  toolCall: vi.fn(),
  executeApproved: vi.fn(),
}));

vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { toolCall: mocks.toolCall },
}));
vi.mock("lib/ai/mcp/execute-approved-mcp-tool", () => ({
  executeApprovedMcpTool: mocks.executeApproved,
}));
vi.mock("lib/ai/mcp/mcp-approval-target", () => ({
  getMcpApprovalTargetFingerprint: vi.fn(async () => "a".repeat(64)),
}));
vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: mocks.currentUser,
  canCreateMCP: vi.fn(),
  canManageMCPServer: vi.fn(),
  canShareMCPServer: vi.fn(),
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgentById: mocks.selectAgent,
    checkAccess: mocks.checkAgentAccess,
  },
  mcpOAuthRepository: {},
  mcpRepository: { selectById: mocks.selectServer },
}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ error: vi.fn() }) },
}));

import { callApprovedVoiceMcpToolAction } from "./actions";

const agentId = "00000000-0000-4000-8000-000000000001";
const serverId = "00000000-0000-4000-8000-000000000010";
const serverName = "CRM";
const toolName = "update_record";
const input = { id: "42", status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "user-1", role: "user" });
  mocks.selectAgent.mockResolvedValue({
    id: agentId,
    instructions: {
      mentions: [{ type: "mcpTool", serverId, name: toolName }],
    },
  });
  mocks.checkAgentAccess.mockResolvedValue(true);
  mocks.selectServer.mockResolvedValue({
    id: serverId,
    name: serverName,
    userId: "user-1",
    visibility: "private",
  });
  mocks.executeApproved.mockImplementation(async (args: any) => {
    const fingerprint = await args.getCurrentConfigFingerprint();
    return args.execute(fingerprint);
  });
  mocks.toolCall.mockResolvedValue({
    content: [{ type: "text", text: "done" }],
  });
});

describe("callApprovedVoiceMcpToolAction", () => {
  it("rechecks agent and MCP access, binds the agent into approval, and dispatches exact arguments once", async () => {
    const result = await callApprovedVoiceMcpToolAction(
      agentId,
      serverId,
      serverName,
      toolName,
      input,
      "one-use-token",
    );

    expect(result).toEqual({ content: [{ type: "text", text: "done" }] });
    expect(mocks.checkAgentAccess).toHaveBeenCalledWith(agentId, "user-1");
    expect(mocks.executeApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        token: "one-use-token",
        approvalPayload: {
          agentId,
          serverId,
          serverName,
          toolName,
          payload: input,
        },
      }),
    );
    expect(mocks.toolCall).toHaveBeenCalledOnce();
    expect(mocks.toolCall).toHaveBeenCalledWith(
      serverId,
      toolName,
      input,
      "a".repeat(64),
      serverName,
    );
  });

  it("does not consume or dispatch an approval after agent access or tool scope is revoked", async () => {
    mocks.checkAgentAccess.mockResolvedValue(false);
    await expect(
      callApprovedVoiceMcpToolAction(
        agentId,
        serverId,
        serverName,
        toolName,
        input,
        "one-use-token",
      ),
    ).rejects.toThrow("The delegated agent can no longer use this MCP tool");
    expect(mocks.executeApproved).not.toHaveBeenCalled();
    expect(mocks.toolCall).not.toHaveBeenCalled();

    mocks.checkAgentAccess.mockResolvedValue(true);
    mocks.selectAgent.mockResolvedValue({
      id: agentId,
      instructions: { mentions: [] },
    });
    await expect(
      callApprovedVoiceMcpToolAction(
        agentId,
        serverId,
        serverName,
        toolName,
        input,
        "one-use-token",
      ),
    ).rejects.toThrow("The delegated agent can no longer use this MCP tool");
    expect(mocks.executeApproved).not.toHaveBeenCalled();
    expect(mocks.toolCall).not.toHaveBeenCalled();
  });
});
