import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));

import { GET, POST } from "./route";

const origin = "https://void-agent.test";
const request = (requestOrigin = origin) =>
  new Request(`${origin}/api/assemblyai/token`, {
    method: "POST",
    headers: { Origin: requestOrigin },
  });

describe("AssemblyAI ephemeral token route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    process.env.ASSEMBLYAI_API_KEY = "test-server-key";
  });

  it("reports availability only to a signed-in user", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("requires auth and same-origin before calling the provider", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ token: "provider-token-123456789" }));
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await POST(request("https://attacker.test"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only a bounded ephemeral token and never caches it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ token: "provider-token-123456789" }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      token: "provider-token-123456789",
    });
  });

  it("fails closed when unavailable, rate-limited, or the provider fails", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    expect((await POST(request())).status).toBe(503);
    process.env.ASSEMBLYAI_API_KEY = "test-server-key";
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("failed", { status: 500 }),
    );
    expect((await POST(request())).status).toBe(503);
  });
});
