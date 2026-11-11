import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setReaction: vi.fn(),
  incrementShare: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: unknown, context?: unknown) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));
vi.mock("lib/community/community-repository.pg", () => ({
  communityRepository: {
    setReaction: mocks.setReaction,
    incrementShare: mocks.incrementShare,
  },
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const postId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id: postId }) };
const makeRequest = (body: unknown) =>
  new Request(`https://app.test/api/community/posts/${postId}/reactions`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.test" },
    body: JSON.stringify(body),
  });

describe("community post reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.setReaction.mockResolvedValue(true);
    mocks.incrementShare.mockResolvedValue(true);
  });

  it("scopes reactions to the session user", async () => {
    const response = await POST(
      makeRequest({ type: "like", active: true }) as never,
      context as never,
    );
    expect(response.status).toBe(200);
    expect(mocks.setReaction).toHaveBeenCalledWith({
      postId,
      userId: "owner-1",
      type: "like",
      active: true,
    });
  });

  it("uses an atomic share counter and rejects invalid/cross-origin writes", async () => {
    expect(
      (await POST(makeRequest({ type: "share" }) as never, context as never))
        .status,
    ).toBe(200);
    expect(mocks.incrementShare).toHaveBeenCalledWith(postId);
    expect(mocks.setReaction).not.toHaveBeenCalled();
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (
        await POST(
          makeRequest({ type: "like", active: true }) as never,
          context as never,
        )
      ).status,
    ).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect(
      (
        await POST(
          makeRequest({ type: "admin", active: true }) as never,
          context as never,
        )
      ).status,
    ).toBe(400);
  });
});
