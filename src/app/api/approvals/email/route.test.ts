import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  issue: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/pg/repositories/email-approval-repository.pg", () => ({
  emailApprovalRepository: { issue: mocks.issue },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.checkApiRateLimit }));

import { POST } from "./route";

const payload = { action: "send", to: "person@example.com", subject: "Update", body: "Approved text" };
const request = (body: unknown = payload, origin = "https://void-agent.test") => new Request("https://void-agent.test/api/approvals/email", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-one-time-token");
});

describe("POST /api/approvals/email", () => {
  it("requires a session and same-origin explicit review request", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.issue).not.toHaveBeenCalled();

    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("stores an owner-bound token only for a valid bounded payload", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "opaque-one-time-token" });
    expect(mocks.issue).toHaveBeenCalledWith("owner-1", payload);

    expect((await POST(request({ ...payload, to: "bad" }))).status).toBe(400);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("rate-limits approval issuance", async () => {
    mocks.checkApiRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
