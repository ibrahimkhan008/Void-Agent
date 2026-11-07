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
vi.mock("lib/cockpit/revolut", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/cockpit/revolut")>()),
  getRevolutConnectionStatus: mocks.getStatus,
  saveRevolutConnection: mocks.save,
  removeRevolutConnection: mocks.remove,
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
    config: {
      clientId: "public-client-id",
      sandbox: true,
      privateKeySet: true,
      refreshTokenSet: true,
    },
    lastTestedAt: null,
    lastTestOk: null,
    updatedAt: null,
  });
  mocks.save.mockResolvedValue({
    connected: true,
    config: {
      clientId: "public-client-id",
      privateKeySet: true,
      refreshTokenSet: true,
    },
  });
  mocks.remove.mockResolvedValue(true);
});

describe("Revolut Cockpit connection API", () => {
  it("returns only public status and enforces team scope membership", async () => {
    const response = await GET(
      request(`/api/cockpit/revolut/connection?teamId=${TEAM}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("privateKeyPem");
    expect(body).not.toContain("refresh-secret-value");
    expect(mocks.resolveStripeScope).toHaveBeenCalledWith("user-1", TEAM);
  });

  it("blocks cross-origin, unauthorized team writes and oversized bodies", async () => {
    const payload = {
      teamId: TEAM,
      config: {
        clientId: "client-123",
        privateKeyPem:
          "-----BEGIN PRIVATE KEY----- test -----END PRIVATE KEY-----",
        authorizationCode: "one-time-code",
        sandbox: true,
        issuer: "example.test",
        largeTransactionThreshold: 5000,
      },
    };
    mocks.resolveStripeScope.mockResolvedValue({
      ok: true,
      canManage: false,
      scope: { userId: "user-1", teamId: TEAM },
    });
    expect(
      (
        await POST(
          request("/api/cockpit/revolut/connection", "POST", payload),
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
            "/api/cockpit/revolut/connection",
            "POST",
            payload,
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    const huge = new Request(
      "https://void.test/api/cockpit/revolut/connection",
      {
        method: "POST",
        headers: { Origin: "https://void.test" },
        body: "x".repeat(17_000),
      },
    );
    expect((await POST(huge)).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires auth and manager scope for removal", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      (await DELETE(request("/api/cockpit/revolut/connection", "DELETE")))
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
          request(`/api/cockpit/revolut/connection?teamId=${TEAM}`, "DELETE"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
