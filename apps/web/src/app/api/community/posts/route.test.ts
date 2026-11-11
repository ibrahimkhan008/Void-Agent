import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: unknown, context?: unknown) =>
      handler(
        request,
        { user: { id: "owner-1", name: "Alice", image: null } },
        context,
      ),
}));
vi.mock("lib/community/community-repository.pg", () => ({
  communityRepository: { createPost: mocks.createPost },
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://app.test/api/community/posts", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.test" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/community/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.createPost.mockResolvedValue({ id: "post-1" });
  });

  it("uses the authenticated owner and returns no storage key", async () => {
    const response = await POST(
      request({
        type: "text",
        content: "hello",
        authorId: "attacker",
      }) as never,
    );
    expect(response.status).toBe(400);
    expect(mocks.createPost).not.toHaveBeenCalled();

    const valid = await POST(
      request({ type: "text", content: "hello #world" }) as never,
    );
    expect(valid.status).toBe(201);
    expect(mocks.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "owner-1", authorName: "Alice" }),
    );
    expect(await valid.json()).toEqual({
      success: true,
      post: { id: "post-1" },
    });
  });

  it("rejects cross-origin writes and rate-limited requests", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (await POST(request({ type: "text", content: "hello" }) as never)).status,
    ).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect(
      (await POST(request({ type: "text", content: "hello" }) as never)).status,
    ).toBe(429);
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("refuses unattached media owned by another user", async () => {
    mocks.createPost.mockResolvedValue(null);
    const response = await POST(
      request({
        type: "media",
        content: "caption",
        mediaId: "00000000-0000-4000-8000-000000000001",
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});
