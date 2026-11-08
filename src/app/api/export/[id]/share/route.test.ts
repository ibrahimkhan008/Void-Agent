import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/chat/export-share-service", () => ({
  rotateOwnerChatShare: mocks.rotate,
  revokeOwnerChatShare: mocks.revoke,
}));
vi.mock("lib/notifications/contracts", () => ({
  isSameOriginRequest: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { DELETE, POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const params = Promise.resolve({ id });

describe("owner-managed chat share links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rotate.mockResolvedValue("the-one-time-token");
    mocks.revoke.mockResolvedValue(true);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
  });

  test("rotates an owner share and returns the bearer once with no-store", async () => {
    const response = await POST(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ token: "the-one-time-token" });
    expect(mocks.rotate).toHaveBeenCalledWith(id, "owner-1");
  });

  test("does not rotate for anonymous callers", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await POST(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(401);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  test("rejects cross-origin mutations before touching the share", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    const response = await POST(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(403);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  test("hides exports not owned by the caller", async () => {
    mocks.rotate.mockResolvedValueOnce(null);
    const response = await POST(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(404);
  });

  test("revokes only for the authenticated owner", async () => {
    const response = await DELETE(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.revoke).toHaveBeenCalledWith(id, "owner-1");
  });

  test("does not revoke for anonymous callers or malformed export IDs", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const anonymous = await DELETE(new Request("https://app.example"), {
      params,
    });
    const malformed = await DELETE(new Request("https://app.example"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(anonymous.status).toBe(401);
    expect(malformed.status).toBe(404);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  test("applies an owner-scoped rate limit to mutations", async () => {
    mocks.rateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 2_000,
    });
    const response = await DELETE(new Request("https://app.example"), {
      params,
    });

    expect(response.status).toBe(429);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "chat-export-share",
      id: "owner-1",
      limit: 20,
      windowMs: 60_000,
    });
  });
});
