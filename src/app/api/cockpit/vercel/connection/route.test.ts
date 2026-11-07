import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  getVercelConnectionStatus: vi.fn(),
  saveVercelConnection: vi.fn(),
  removeVercelConnection: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/cache", () => ({ serverCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/vercel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lib/cockpit/vercel")>();
  return {
    ...actual,
    getVercelConnectionStatus: mocks.getVercelConnectionStatus,
    saveVercelConnection: mocks.saveVercelConnection,
    removeVercelConnection: mocks.removeVercelConnection,
  };
});

import { DELETE, GET, POST } from "./route";

const TEAM = "00000000-0000-4000-8000-000000000001";
const config = {
  token: "vercel-secret-token",
  teamId: "team_abc123",
  projects: [{ key: "nav", projectId: "prj_1", label: "Navigator" }],
};
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  origin = "https://app.test",
) =>
  new Request(`https://app.test${path}`, {
    method,
    headers: {
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.resolveStripeScope.mockImplementation(
    async (userId: string, teamId: string | null) => ({
      ok: true,
      canManage: true,
      scope: { userId, teamId },
    }),
  );
  mocks.getVercelConnectionStatus.mockResolvedValue({
    connected: true,
    config: {
      teamId: "team_abc123",
      projects: config.projects,
      tokenSet: true,
    },
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: null,
  });
  mocks.saveVercelConnection.mockResolvedValue({
    connected: true,
    config: {
      teamId: "team_abc123",
      projects: config.projects,
      tokenSet: true,
    },
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: null,
  });
  mocks.removeVercelConnection.mockResolvedValue(true);
});

describe("Vercel Cockpit connection API", () => {
  it("returns safe project config without returning the encrypted token", async () => {
    const response = await GET(
      request(`/api/cockpit/vercel/connection?teamId=${TEAM}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      connected: true,
      canManage: true,
      config: { tokenSet: true, projects: config.projects },
    });
    expect(JSON.stringify(body)).not.toContain(config.token);
    expect(JSON.stringify(body)).not.toContain("configEncrypted");
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM);
  });

  it("allows team-member read scope while denying viewer key changes", async () => {
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (await GET(request(`/api/cockpit/vercel/connection?teamId=${TEAM}`)))
        .status,
    ).toBe(200);
    expect(
      (
        await POST(
          request("/api/cockpit/vercel/connection", "POST", {
            teamId: TEAM,
            config,
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.saveVercelConnection).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, unauthenticated, oversized, malformed and rate-limited writes", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          request("/api/cockpit/vercel/connection", "POST", {
            teamId: null,
            config,
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          request(
            "/api/cockpit/vercel/connection",
            "POST",
            { teamId: null, config },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    const huge = request("/api/cockpit/vercel/connection", "POST", {
      teamId: null,
      config: { ...config, token: "x".repeat(20_000) },
    });
    expect((await POST(huge)).status).toBe(413);
    expect(
      (
        await POST(
          request("/api/cockpit/vercel/connection", "POST", {
            teamId: null,
            config: { ...config, extra: "no" },
          }),
        )
      ).status,
    ).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect(
      (
        await POST(
          request("/api/cockpit/vercel/connection", "POST", {
            teamId: null,
            config,
          }),
        )
      ).status,
    ).toBe(429);
    expect(mocks.saveVercelConnection).not.toHaveBeenCalled();
  });

  it("stores the full config through the encrypted service and returns only a redacted projection", async () => {
    const response = await POST(
      request("/api/cockpit/vercel/connection", "POST", {
        teamId: TEAM,
        config,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.saveVercelConnection).toHaveBeenCalledWith(
      { userId: "user-1", teamId: TEAM },
      config,
    );
    expect(JSON.stringify(await response.json())).not.toContain(config.token);
  });

  it("requires manager access for team removal", async () => {
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/vercel/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: true,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/vercel/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(200);
    expect(mocks.removeVercelConnection).toHaveBeenCalledWith({
      userId: "user-1",
      teamId: TEAM,
    });
  });
});
