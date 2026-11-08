import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  issue: vi.fn(),
  selectById: vi.fn(),
  selectAgentById: vi.fn(),
  checkAgentAccess: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/repositories/mcp-tool-approval-repository.pg", () => ({
  mcpToolApprovalRepository: { issue: mocks.issue },
}));
vi.mock("lib/db/repository", () => ({
  mcpRepository: { selectById: mocks.selectById },
  agentRepository: {
    selectAgentById: mocks.selectAgentById,
    checkAccess: mocks.checkAgentAccess,
  },
}));

import { createMcpServerConfigFingerprint } from "lib/ai/tools/hitl/mcp-tool-approval";
import { POST } from "./route";

const payload = {
  serverId: "00000000-0000-4000-8000-000000000001",
  serverName: "CRM",
  toolName: "update_record",
  payload: { id: "42", status: "active" },
  serverConfigFingerprint: "",
};
const request = (body: unknown = payload, origin = "https://void-agent.test") =>
  new Request("https://void-agent.test/api/approvals/mcp-tool", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "test-mcp-fingerprint-secret");
  mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "user" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-mcp-token");
  const config = {
    url: "https://crm.example/api",
    headers: { authorization: "secret" },
  };
  payload.serverConfigFingerprint = createMcpServerConfigFingerprint(config);
  mocks.selectById.mockResolvedValue({
    id: payload.serverId,
    name: "CRM",
    userId: "user-1",
    visibility: "private",
    enabled: true,
    config,
  });
  mocks.selectAgentById.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000002",
    instructions: {
      mentions: [
        {
          type: "mcpTool",
          serverId: payload.serverId,
          name: payload.toolName,
        },
      ],
    },
  });
  mocks.checkAgentAccess.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/approvals/mcp-tool", () => {
  it("issues a no-store token for the reviewed server/tool/arguments", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      approvalToken: "opaque-mcp-token",
    });
    expect(mocks.issue).toHaveBeenCalledWith(
      "user-1",
      {
        serverId: payload.serverId,
        serverName: payload.serverName,
        toolName: payload.toolName,
        payload: payload.payload,
      },
      createMcpServerConfigFingerprint({
        url: "https://crm.example/api",
        headers: { authorization: "secret" },
      }),
    );
  });

  it("rejects unauthenticated, cross-origin and invalid input", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(
      403,
    );
    expect(
      (await POST(request({ ...payload, serverId: "invalid" }))).status,
    ).toBe(400);
    expect(
      (await POST(request({ ...payload, serverConfigFingerprint: "" }))).status,
    ).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects a missing, renamed, or inaccessible server before issuing approval", async () => {
    mocks.selectById.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    mocks.selectById.mockResolvedValue({
      id: payload.serverId,
      name: "Other",
      userId: "user-1",
      visibility: "private",
      config: { url: "https://crm.example/api" },
    });
    expect((await POST(request())).status).toBe(404);
    mocks.selectById.mockResolvedValue({
      id: payload.serverId,
      name: "CRM",
      userId: "someone-else",
      visibility: "private",
      config: { url: "https://crm.example/api" },
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects stale, disabled, and deleted proposal targets without issuing tokens", async () => {
    mocks.selectById.mockResolvedValue({
      id: payload.serverId,
      name: "CRM",
      userId: "user-1",
      visibility: "private",
      enabled: true,
      config: { url: "https://retargeted.example/mcp" },
    });
    expect((await POST(request())).status).toBe(409);

    mocks.selectById.mockResolvedValue({
      id: payload.serverId,
      name: "CRM",
      userId: "user-1",
      visibility: "private",
      enabled: false,
      config: {
        url: "https://crm.example/api",
        headers: { authorization: "secret" },
      },
    });
    expect((await POST(request())).status).toBe(409);

    mocks.selectById.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("binds voice approval tokens to a currently accessible agent and its exact MCP mention", async () => {
    const agentId = "00000000-0000-4000-8000-000000000002";
    const response = await POST(request({ ...payload, agentId }));
    expect(response.status).toBe(200);
    expect(mocks.selectAgentById).toHaveBeenCalledWith(agentId, "user-1");
    expect(mocks.checkAgentAccess).toHaveBeenCalledWith(agentId, "user-1");
    expect(mocks.issue).toHaveBeenCalledWith(
      "user-1",
      {
        agentId,
        serverId: payload.serverId,
        serverName: payload.serverName,
        toolName: payload.toolName,
        payload: payload.payload,
      },
      payload.serverConfigFingerprint,
    );

    mocks.selectAgentById.mockResolvedValueOnce({
      id: agentId,
      instructions: { mentions: [] },
    });
    expect((await POST(request({ ...payload, agentId }))).status).toBe(403);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });
});
