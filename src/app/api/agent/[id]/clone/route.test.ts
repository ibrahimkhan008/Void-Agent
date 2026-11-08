import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canCreateAgent: vi.fn(),
  clonePublishedAgentForUser: vi.fn(),
  isSameOriginRequest: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canCreateAgent: mocks.canCreateAgent,
}));
vi.mock("lib/db/pg/repositories/agent-clone-repository.pg", () => ({
  clonePublishedAgentForUser: mocks.clonePublishedAgentForUser,
}));
vi.mock("lib/notifications/contracts", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const agentId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: agentId }) };
const request = (origin = "https://app.example") =>
  new Request(`https://app.example/api/agent/${agentId}/clone`, {
    method: "POST",
    headers: { origin },
  });

describe("POST /api/agent/[id]/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "copy-owner" } });
    mocks.canCreateAgent.mockResolvedValue(true);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.clonePublishedAgentForUser.mockResolvedValue({
      agentId: "new-agent-id",
      created: true,
    });
  });

  it("creates a user-owned copy for a published source", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      agentId: "new-agent-id",
      created: true,
    });
    expect(mocks.clonePublishedAgentForUser).toHaveBeenCalledWith(
      agentId,
      "copy-owner",
    );
  });

  it("returns the existing copy for an idempotent retry", async () => {
    mocks.clonePublishedAgentForUser.mockResolvedValue({
      agentId: "new-agent-id",
      created: false,
    });
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect((await response.json()).agentId).toBe("new-agent-id");
  });

  it("requires authentication, create permission, same origin, valid ID and rate capacity", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request(), params)).status).toBe(401);

    mocks.canCreateAgent.mockResolvedValueOnce(false);
    expect((await POST(request(), params)).status).toBe(403);

    mocks.isSameOriginRequest.mockReturnValueOnce(false);
    expect((await POST(request(), params)).status).toBe(403);

    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ id: "not-a-uuid" }),
        })
      ).status,
    ).toBe(400);

    mocks.rateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 5_000,
    });
    const limited = await POST(request(), params);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("5");
    expect(mocks.clonePublishedAgentForUser).not.toHaveBeenCalled();
  });

  it("does not copy an unpublished or private source", async () => {
    mocks.clonePublishedAgentForUser.mockResolvedValueOnce(null);
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
  });
});
