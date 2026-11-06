import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  markRead: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  notificationRepository: { markRead: mocks.markRead },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function request(origin = "https://app.example") {
  return new Request("https://app.example/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ ids: ["11111111-1111-4111-8111-111111111111"] }),
  });
}

describe("notification read mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.markRead.mockResolvedValue(1);
  });

  it("rejects cross-origin requests before changing notifications", async () => {
    const response = await POST(request("https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("marks only the requested IDs for the authenticated owner", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.markRead).toHaveBeenCalledWith("owner-1", [
      "11111111-1111-4111-8111-111111111111",
    ]);
  });
});
