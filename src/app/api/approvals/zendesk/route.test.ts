import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), checkApiRateLimit: vi.fn(), issue: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.checkApiRateLimit }));
vi.mock("lib/db/pg/repositories/zendesk-approval-repository.pg", () => ({ zendeskApprovalRepository: { issue: mocks.issue } }));

import { POST } from "./route";

const payload = { ticketId: "123", comment: "Reviewed comment" };
const request = (body: unknown = payload, origin = "https://void-agent.test") => new Request(
  "https://void-agent.test/api/approvals/zendesk",
  { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-zendesk-token");
});

describe("POST /api/approvals/zendesk", () => {
  it("issues a private token for exact ticket comment content", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "opaque-zendesk-token" });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects cross-origin and malformed approvals", async () => {
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(403);
    expect((await POST(request({ ...payload, ticketId: "../1" }))).status).toBe(400);
    expect((await POST(request({ ...payload, extra: true }))).status).toBe(400);
  });
});
