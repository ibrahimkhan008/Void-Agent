import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  search: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/skills/registry", () => ({
  searchSkillsRegistry: mocks.search,
  SkillsRegistryError: class SkillsRegistryError extends Error {
    status = 502;
  },
}));

import { GET } from "./route";

describe("skills registry search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.search.mockResolvedValue([
      { id: "skill", name: "Skill", source: "org/repo", installs: 1 },
    ]);
  });

  it("requires a signed-in user and does not call the registry otherwise", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(
      new Request("https://example.test/api/skills/search?q=react"),
    );
    expect(response.status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("limits searches and returns private no-store results", async () => {
    const response = await GET(
      new Request("https://example.test/api/skills/search?q=react"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      skills: [{ id: "skill", name: "Skill", source: "org/repo", installs: 1 }],
    });
    expect(mocks.rate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", limit: 30 }),
    );
    expect(mocks.search).toHaveBeenCalledWith("react");
  });

  it("rejects oversized queries before calling upstream", async () => {
    const query = "x".repeat(101);
    const response = await GET(
      new Request(`https://example.test/api/skills/search?q=${query}`),
    );
    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
