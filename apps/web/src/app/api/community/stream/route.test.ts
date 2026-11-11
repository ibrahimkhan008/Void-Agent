import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listFeed: vi.fn(), rateLimit: vi.fn() }));
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request: unknown) =>
    handler(request, { user: { id: "owner-1" } }),
}));
vi.mock("lib/community/community-repository.pg", () => ({
  communityRepository: { listFeed: mocks.listFeed },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { GET } from "./route";

describe("community stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.listFeed.mockResolvedValue({
      posts: [],
      stats: { members: 0, postsToday: 0, activeNow: 0 },
      trendingTopics: [],
      topContributors: [],
    });
  });

  it("authenticates before opening a bounded no-store event stream", async () => {
    const response = await GET(
      new Request("https://app.test/api/community/stream?tab=Latest") as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(mocks.listFeed).toHaveBeenCalledWith("owner-1", "Latest");
    const reader = response.body?.getReader();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain('"posts":[]');
    await reader?.cancel();
  });

  it("refuses rate-limited stream creation", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    const response = await GET(
      new Request("https://app.test/api/community/stream") as never,
    );
    expect(response.status).toBe(429);
    expect(mocks.listFeed).not.toHaveBeenCalled();
  });
});
