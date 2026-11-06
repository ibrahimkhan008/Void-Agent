import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), checkApiRateLimit: vi.fn(), issue: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.checkApiRateLimit }));
vi.mock("lib/db/pg/repositories/messaging-approval-repository.pg", () => ({ messagingApprovalRepository: { issue: mocks.issue } }));

import { POST } from "./route";

const payload = { provider: "teams", destination: "chat-id", content: "Reviewed message" };
const request = (body: unknown = payload, origin = "https://void-agent.test") => new Request(
  "https://void-agent.test/api/approvals/messaging",
  { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.issue.mockResolvedValue("opaque-messaging-token");
});

describe("POST /api/approvals/messaging", () => {
  it("issues a no-store token for the exact user-reviewed message", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ approvalToken: "opaque-messaging-token" });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects invalid provider-specific fields and cross-origin calls", async () => {
    expect((await POST(request({ provider: "zulip", destination: "general", content: "Hello" }))).status).toBe(400);
    expect((await POST(request({ ...payload, topic: "unrelated" }))).status).toBe(400);
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(403);
  });
});
