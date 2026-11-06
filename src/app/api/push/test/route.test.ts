import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listSubscriptions: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  notificationRepository: {
    listPushSubscriptions: mocks.listSubscriptions,
    create: mocks.create,
  },
}));
vi.mock("lib/notifications/web-push", () => ({
  isWebPushConfigured: () => true,
  sendPushToUser: mocks.send,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const request = (origin = "https://app.example") =>
  new Request("https://app.example/api/push/test", {
    method: "POST",
    headers: { Origin: origin },
  });

describe("push test notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.listSubscriptions.mockResolvedValue([
      { endpoint: "https://push.example" },
    ]);
    mocks.send.mockResolvedValue({ sent: 1, skipped: false });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects cross-origin requests before attempting delivery", async () => {
    const response = await POST(request("https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not report success or create a test record when delivery reaches no endpoint", async () => {
    mocks.send.mockResolvedValue({ sent: 0, skipped: false });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("records a test notification only after a successful delivery", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ href: "/notifications" }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", type: "push_test" }),
    );
  });
});
