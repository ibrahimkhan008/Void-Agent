import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  requestProviderDiscovery: vi.fn(),
  getConfig: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
}));
vi.mock("lib/security/encryption", () => ({ decrypt: mocks.decrypt }));
vi.mock("lib/admin/provider-discovery", async () => {
  const actual = await vi.importActual<
    typeof import("lib/admin/provider-discovery")
  >("lib/admin/provider-discovery");
  return {
    ...actual,
    requestProviderDiscovery: mocks.requestProviderDiscovery,
  };
});

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("https://local.test/api/admin/providers/discover", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://local.test",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/admin/providers/discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.requestProviderDiscovery.mockResolvedValue({
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        data: [{ id: "model-a" }, { name: "model-b" }, { id: "model-a" }],
      }),
    });
    mocks.getConfig.mockResolvedValue({
      dynamicProviders: {
        "gateway-one": {
          baseURL: "https://provider.test/v1",
          apiKey: "encrypted-key",
        },
      },
    });
    mocks.decrypt.mockReturnValue("stored-secret");
  });

  it("requires admin permission before processing or fetching", async () => {
    mocks.requireAdminPermission.mockRejectedValue(new Error("forbidden"));
    const response = await POST(
      request({ baseURL: "https://provider.test", apiKey: "secret" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.requestProviderDiscovery).not.toHaveBeenCalled();
  });

  it("sends the key only in provider authorization headers and returns unique models", async () => {
    const response = await POST(
      request({ baseURL: "https://provider.test/v1/", apiKey: "secret-value" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      models: ["model-a", "model-b"],
    });
    expect(mocks.requestProviderDiscovery).toHaveBeenCalledWith(
      "https://provider.test/v1/models",
      "secret-value",
    );
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "admin-provider-model-discovery",
      id: "admin-1",
      limit: 20,
      windowMs: 60_000,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses a saved key server-side for the matching provider endpoint", async () => {
    const response = await POST(
      request({
        providerId: "gateway-one",
        baseURL: "https://provider.test/v1/",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.decrypt).toHaveBeenCalledWith("encrypted-key");
    expect(mocks.requestProviderDiscovery).toHaveBeenCalledWith(
      "https://provider.test/v1/models",
      "stored-secret",
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "stored-secret",
    );
  });

  it("never reuses a saved key after the provider endpoint changes", async () => {
    const response = await POST(
      request({
        providerId: "gateway-one",
        baseURL: "https://other-provider.test/v1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.requestProviderDiscovery).not.toHaveBeenCalled();
  });

  it("rejects invalid schemas and oversized request bodies without contacting providers", async () => {
    const invalid = await POST(
      request({ baseURL: "not-a-url", extra: "field" }),
    );
    expect(invalid.status).toBe(400);

    const oversized = await POST(
      request({ baseURL: "https://provider.test", apiKey: "x".repeat(9_000) }),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.requestProviderDiscovery).not.toHaveBeenCalled();
  });

  it("rejects requests without a matching origin and throttles repeated discovery", async () => {
    const crossOrigin = await POST(
      new Request("https://local.test/api/admin/providers/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.test",
        },
        body: JSON.stringify({ baseURL: "https://provider.test" }),
      }),
    );
    expect(crossOrigin.status).toBe(403);

    mocks.rateLimit.mockResolvedValue({ allowed: false });
    const throttled = await POST(request({ baseURL: "https://provider.test" }));
    expect(throttled.status).toBe(429);
    expect(mocks.requestProviderDiscovery).not.toHaveBeenCalled();
  });
});
