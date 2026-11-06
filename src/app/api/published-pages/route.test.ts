import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectByOwner: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  publishedPageRepository: { selectByOwner: mocks.selectByOwner },
}));

import { GET } from "./route";

describe("published page management listing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only summaries for the current user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" } });
    mocks.selectByOwner.mockResolvedValue([
      { slug: "page-abc", version: 1, title: "Page" },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.selectByOwner).toHaveBeenCalledWith("user-a");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not access storage for anonymous users", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.selectByOwner).not.toHaveBeenCalled();
  });
});
