import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  getConnectionStatus: vi.fn(),
  saveStripeConnection: vi.fn(),
  removeStripeConnection: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/stripe", () => ({
  getConnectionStatus: mocks.getConnectionStatus,
  isRestrictedStripeKey: (value: unknown) =>
    typeof value === "string" && /^rk_(live|test)_[A-Za-z0-9]{8,}$/.test(value),
  removeStripeConnection: mocks.removeStripeConnection,
  saveStripeConnection: mocks.saveStripeConnection,
}));

import { DELETE, GET, POST } from "./route";

const TEAM = "00000000-0000-4000-8000-000000000001";
const request = (
  path = "/api/cockpit/stripe/connection",
  method = "POST",
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
  mocks.getConnectionStatus.mockResolvedValue({
    connected: true,
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: "2026-11-07T00:00:00.000Z",
  });
  mocks.saveStripeConnection.mockResolvedValue({
    connected: true,
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: "2026-11-07T00:00:00.000Z",
  });
  mocks.removeStripeConnection.mockResolvedValue(true);
});

describe("Stripe Cockpit connection API", () => {
  it("returns only redacted owner/team connection metadata", async () => {
    const response = await GET(
      request(`/api/cockpit/stripe/connection?teamId=${TEAM}`, "GET"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ connected: true, canManage: true });
    expect(JSON.stringify(body)).not.toMatch(
      /secret|restrictedKey|rk_live|rk_test/i,
    );
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM);
  });

  it("allows a verified team member to read metadata without granting key management", async () => {
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    const response = await GET(
      request(`/api/cockpit/stripe/connection?teamId=${TEAM}`, "GET"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      connected: true,
      canManage: false,
    });
  });

  it("rejects unauthenticated and cross-origin key changes", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          request(undefined, "POST", { restrictedKey: "rk_test_AbCd12345678" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          request(
            undefined,
            "POST",
            { restrictedKey: "rk_test_AbCd12345678" },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.saveStripeConnection).not.toHaveBeenCalled();
  });

  it("validates and stores a secret only under the authorized team scope", async () => {
    const secret = "rk_test_AbCd12345678";
    const response = await POST(
      request(undefined, "POST", { restrictedKey: secret, teamId: TEAM }),
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
    expect(mocks.saveStripeConnection).toHaveBeenCalledWith(
      { userId: "user-1", teamId: TEAM },
      secret,
    );
  });

  it("denies team viewers key management and rejects malformed credentials", async () => {
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await POST(
          request(undefined, "POST", {
            restrictedKey: "rk_test_AbCd12345678",
            teamId: TEAM,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request(undefined, "POST", { restrictedKey: "sk_live_secretsecret" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.saveStripeConnection).not.toHaveBeenCalled();
  });

  it("rejects oversized/malformed payloads and rate-limited key changes", async () => {
    const huge = new Request("https://app.test/api/cockpit/stripe/connection", {
      method: "POST",
      headers: {
        Origin: "https://app.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ restrictedKey: "x".repeat(5_000) }),
    });
    expect((await POST(huge)).status).toBe(413);
    const malformed = new Request(
      "https://app.test/api/cockpit/stripe/connection",
      {
        method: "POST",
        headers: {
          Origin: "https://app.test",
          "Content-Type": "application/json",
        },
        body: "{invalid",
      },
    );
    expect((await POST(malformed)).status).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect(
      (
        await POST(
          request(undefined, "POST", { restrictedKey: "rk_test_AbCd12345678" }),
        )
      ).status,
    ).toBe(429);
    expect(mocks.saveStripeConnection).not.toHaveBeenCalled();
  });

  it("requires a manager to delete the selected scoped connection", async () => {
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/stripe/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.removeStripeConnection).not.toHaveBeenCalled();
    mocks.resolveStripeScope.mockResolvedValueOnce({
      ok: true,
      canManage: true,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await DELETE(
          request(`/api/cockpit/stripe/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(200);
    expect(mocks.removeStripeConnection).toHaveBeenCalledWith({
      userId: "user-1",
      teamId: TEAM,
    });
  });
});
