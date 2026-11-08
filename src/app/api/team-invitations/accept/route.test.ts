import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  accept: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  teamInvitationRepository: { accept: mocks.accept },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000010";
const request = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/team-invitations/accept", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("team invitation acceptance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: userId } });
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.accept.mockResolvedValue({
      status: "accepted",
      teamId: "00000000-0000-4000-8000-000000000011",
    });
  });

  it("accepts only from a same-origin authenticated POST and never uses the URL query", async () => {
    const response = await POST(request({ token: "x".repeat(43) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.accept).toHaveBeenCalledWith({
      token: "x".repeat(43),
      userId,
    });
  });

  it("rejects cross-origin requests before authentication", async () => {
    const response = await POST(
      request({ token: "x".repeat(43) }, "https://attacker.test"),
    );
    expect(response.status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("requires the signed-in user to have a valid token format", async () => {
    const response = await POST(request({ token: "short" }));
    expect(response.status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
