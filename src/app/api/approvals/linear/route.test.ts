import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), checkApiRateLimit: vi.fn(), issue: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.checkApiRateLimit }));
vi.mock("lib/db/pg/repositories/linear-approval-repository.pg", () => ({
  linearApprovalRepository: { issue: mocks.issue },
}));

import { POST } from "./route";

const payload = { teamId: "00000000-0000-4000-8000-000000000001", title: "Fix launch blocker", description: "Investigate the failing workflow." };
const request = (body: unknown = payload, origin = "https://void-agent.test") => new Request(
  "https://void-agent.test/api/approvals/linear",
  { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-linear-token");
});

describe("POST /api/approvals/linear", () => {
  it("issues a non-cacheable token bound to the reviewed exact issue", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "opaque-linear-token" });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects cross-origin, malformed, and rate-limited approval requests", async () => {
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(403);
    expect((await POST(request({ ...payload, unexpected: "field" }))).status).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
