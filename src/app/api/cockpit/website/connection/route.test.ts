import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  getWebsiteConnectionStatus: vi.fn(),
  saveWebsiteConnection: vi.fn(),
  removeWebsiteConnection: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/website", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/cockpit/website")>()),
  getWebsiteConnectionStatus: mocks.getWebsiteConnectionStatus,
  saveWebsiteConnection: mocks.saveWebsiteConnection,
  removeWebsiteConnection: mocks.removeWebsiteConnection,
}));

import { DELETE, GET, POST } from "./route";

const TEAM = "00000000-0000-4000-8000-000000000001";
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  origin = "https://void.test",
) =>
  new Request(`https://void.test${path}`, {
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
  mocks.getWebsiteConnectionStatus.mockResolvedValue({
    connected: true,
    config: {
      supabaseUrl: "https://abc.supabase.co",
      rangeDays: 30,
      secretSet: true,
    },
  });
  mocks.saveWebsiteConnection.mockResolvedValue({
    connected: true,
    config: {
      supabaseUrl: "https://abc.supabase.co",
      rangeDays: 30,
      secretSet: true,
    },
  });
  mocks.removeWebsiteConnection.mockResolvedValue(true);
});

describe("Website Cockpit connection API", () => {
  it("returns a redacted connection status for an authorized scope", async () => {
    const response = await GET(
      request(`/api/cockpit/website/connection?teamId=${TEAM}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain(
      "sb_secret_test-secret-value",
    );
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM);
  });

  it("allows team reads but blocks viewer changes, cross-origin and oversized writes", async () => {
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (await GET(request(`/api/cockpit/website/connection?teamId=${TEAM}`)))
        .status,
    ).toBe(200);
    expect(
      (
        await POST(
          request("/api/cockpit/website/connection", "POST", {
            teamId: TEAM,
            config: { supabaseUrl: "https://abc.supabase.co", rangeDays: 30 },
          }),
        )
      ).status,
    ).toBe(403);
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: true,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await POST(
          request(
            "/api/cockpit/website/connection",
            "POST",
            { teamId: TEAM, config: {} },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    const huge = new Request(
      "https://void.test/api/cockpit/website/connection",
      {
        method: "POST",
        headers: { Origin: "https://void.test" },
        body: "x".repeat(17_000),
      },
    );
    expect((await POST(huge)).status).toBe(413);
    expect(mocks.saveWebsiteConnection).not.toHaveBeenCalled();
  });

  it("requires authentication, membership, and manager access before deleting", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      (await DELETE(request("/api/cockpit/website/connection", "DELETE")))
        .status,
    ).toBe(401);
    mocks.resolveStripeScope.mockResolvedValueOnce({ ok: false });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/website/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/website/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.removeWebsiteConnection).not.toHaveBeenCalled();
  });
});
