import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  getStatus: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/superlog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/cockpit/superlog")>()),
  getSuperlogConnectionStatus: mocks.getStatus,
  saveSuperlogConnection: mocks.save,
  removeSuperlogConnection: mocks.remove,
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
  mocks.getStatus.mockResolvedValue({
    connected: true,
    tokenSet: true,
    lastTestOk: true,
  });
  mocks.save.mockResolvedValue({ connected: true, tokenSet: true });
  mocks.remove.mockResolvedValue(true);
});

describe("Superlog Cockpit connection API", () => {
  it("returns secret-free status and requires membership for a team", async () => {
    const response = await GET(
      request(`/api/cockpit/superlog/connection?teamId=${TEAM}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("superlog_pat");
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM);
    mocks.resolveStripeScope.mockResolvedValueOnce({ ok: false });
    expect(
      (await GET(request(`/api/cockpit/superlog/connection?teamId=${TEAM}`)))
        .status,
    ).toBe(403);
  });

  it("blocks cross-origin, viewer and unbounded or arbitrary endpoint writes", async () => {
    const payload = {
      teamId: TEAM,
      config: { token: "superlog_pat_valid-value" },
    };
    expect(
      (
        await POST(
          request(
            "/api/cockpit/superlog/connection",
            "POST",
            payload,
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (await POST(request("/api/cockpit/superlog/connection", "POST", payload)))
        .status,
    ).toBe(403);
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: true,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await POST(
          request("/api/cockpit/superlog/connection", "POST", {
            ...payload,
            config: { ...payload.config, mcpUrl: "https://attacker.test/mcp" },
          }),
        )
      ).status,
    ).toBe(400);
    const huge = new Request(
      "https://void.test/api/cockpit/superlog/connection",
      {
        method: "POST",
        headers: { Origin: "https://void.test" },
        body: "x".repeat(5_000),
      },
    );
    expect((await POST(huge)).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires authenticated manager scope for removal", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      (await DELETE(request("/api/cockpit/superlog/connection", "DELETE")))
        .status,
    ).toBe(401);
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/superlog/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
