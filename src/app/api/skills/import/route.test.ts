import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  boundedJson: vi.fn(),
  fetchSkill: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/http/bounded-json-request", () => ({
  readBoundedJsonRequest: mocks.boundedJson,
}));
vi.mock("lib/skills/registry", () => ({
  fetchRegistrySkill: mocks.fetchSkill,
  SkillsRegistryError: class SkillsRegistryError extends Error {
    status = 422;
  },
}));

import { POST } from "./route";

const makeRequest = (origin = "https://example.test") =>
  new Request("https://example.test/api/skills/import", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ source: "owner/repo", slug: "skill" }),
  });

describe("skills registry import preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.boundedJson.mockResolvedValue({
      ok: true,
      value: { source: "owner/repo", slug: "skill" },
    });
    mocks.fetchSkill.mockResolvedValue({
      name: "Skill",
      markdown: "Instructions",
      license: "MIT",
    });
  });

  it("requires same-origin, authenticated, rate-limited access", async () => {
    expect((await POST(makeRequest("https://attacker.test"))).status).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
    expect(mocks.fetchSkill).not.toHaveBeenCalled();
  });

  it("returns a private no-store draft without persisting it", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ markdown: "Instructions" });
    expect(mocks.fetchSkill).toHaveBeenCalledWith("owner/repo", "skill");
  });
});
