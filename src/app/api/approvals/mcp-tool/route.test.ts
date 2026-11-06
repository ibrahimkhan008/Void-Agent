import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), checkApiRateLimit: vi.fn(), issue: vi.fn(), selectById: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.checkApiRateLimit }));
vi.mock("lib/db/pg/repositories/mcp-tool-approval-repository.pg", () => ({ mcpToolApprovalRepository: { issue: mocks.issue } }));
vi.mock("lib/db/repository", () => ({ mcpRepository: { selectById: mocks.selectById } }));

import { POST } from "./route";

const payload = { serverId: "00000000-0000-4000-8000-000000000001", serverName: "CRM", toolName: "update_record", payload: { id: "42", status: "active" } };
const request = (body: unknown = payload, origin = "https://void-agent.test") => new Request("https://void-agent.test/api/approvals/mcp-tool", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "user" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-mcp-token");
  mocks.selectById.mockResolvedValue({ id: payload.serverId, name: "CRM", userId: "user-1", visibility: "private" });
});

describe("POST /api/approvals/mcp-tool", () => {
  it("issues a no-store token for the reviewed server/tool/arguments", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "opaque-mcp-token" });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects unauthenticated, cross-origin and invalid input", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(403);
    expect((await POST(request({ ...payload, serverId: "invalid" }))).status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects a missing, renamed, or inaccessible server before issuing approval", async () => {
    mocks.selectById.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    mocks.selectById.mockResolvedValue({ id: payload.serverId, name: "Other", userId: "user-1", visibility: "private" });
    expect((await POST(request())).status).toBe(404);
    mocks.selectById.mockResolvedValue({ id: payload.serverId, name: "CRM", userId: "someone-else", visibility: "private" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
