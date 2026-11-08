import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createShare: vi.fn(),
  sameOrigin: vi.fn(),
  readBounded: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/chat/export-share-service", () => ({
  createOwnerChatShare: mocks.createShare,
}));
vi.mock("lib/notifications/contracts", () => ({
  isSameOriginRequest: mocks.sameOrigin,
  readBoundedJson: mocks.readBounded,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function request() {
  return new Request("https://app.example/api/chat/export", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example",
    },
    body: JSON.stringify({ threadId: "11111111-1111-4111-8111-111111111111" }),
  });
}

describe("chat export share creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.readBounded.mockResolvedValue({
      ok: true,
      value: { threadId: "11111111-1111-4111-8111-111111111111" },
    });
    mocks.createShare.mockResolvedValue({
      exportId: "export-1",
      token: "secret-token",
    });
  });

  test("creates a token-backed owner share and returns no-store response", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      exportId: "export-1",
      shareToken: "secret-token",
    });
    expect(mocks.readBounded).toHaveBeenCalledWith(expect.any(Request), 4_096);
    expect(mocks.createShare).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "owner-1",
      undefined,
    );
  });

  test("rejects cross-origin requests and oversized JSON before creating a share", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    const crossOrigin = await POST(request());
    mocks.readBounded.mockResolvedValueOnce({ ok: false, tooLarge: true });
    const oversized = await POST(request());

    expect(crossOrigin.status).toBe(403);
    expect(oversized.status).toBe(413);
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  test("requires authentication and applies per-user rate limits", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const anonymous = await POST(request());
    mocks.rateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 1_500,
    });
    const limited = await POST(request());

    expect(anonymous.status).toBe(401);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("2");
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  test("does not disclose whether a thread is owned by another user", async () => {
    mocks.createShare.mockRejectedValueOnce(new Error("Thread not found"));
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("owner");
  });
});
