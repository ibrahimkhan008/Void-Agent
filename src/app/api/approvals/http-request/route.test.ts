import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  issue: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/repositories/http-request-approval-repository.pg", () => ({
  httpRequestApprovalRepository: { issue: mocks.issue },
}));

import { POST } from "./route";

const approval = {
  url: "https://api.example.com/v1/items",
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
  timeout: 10_000,
};
const request = (
  body: unknown = approval,
  origin = "https://void-agent.test",
) =>
  new Request("https://void-agent.test/api/approvals/http-request", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-http-token");
});

describe("POST /api/approvals/http-request", () => {
  it("issues an uncached token bound to the reviewed request", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      approvalToken: "opaque-http-token",
    });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", approval);
  });
  it("rejects unauthenticated, cross-origin, malformed, oversized, and rate-limited input", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (await POST(request(approval, "https://attacker.test"))).status,
    ).toBe(403);
    expect((await POST(request({ ...approval, method: "TRACE" }))).status).toBe(
      400,
    );
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
