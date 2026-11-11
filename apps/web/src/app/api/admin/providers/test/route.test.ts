import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  getConfig: vi.fn(),
  decrypt: vi.fn(),
  requestDiscovery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
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
  return { ...actual, requestProviderDiscovery: mocks.requestDiscovery };
});

let POST: typeof import("./route").POST;

const request = (provider: string) =>
  new Request("https://local.test/api/admin/providers/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://local.test",
    },
    body: JSON.stringify({ provider }),
  });

describe("POST /api/admin/providers/test", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google-key");
    vi.resetModules();
    POST = (await import("./route")).POST;
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.getConfig.mockResolvedValue({ dynamicProviders: {} });
    mocks.decrypt.mockReturnValue("server-secret");
    mocks.requestDiscovery.mockResolvedValue({ status: 200, body: "{}" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("constructs a valid Google models endpoint and returns no credential data", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request("google"));
    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      RequestInfo,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    );
    expect(new Headers(options.headers).get("x-goog-api-key")).toBe(
      "test-google-key",
    );
    expect(await response.text()).not.toContain("test-google-key");
  });

  it("uses the server-held dynamic key through the protected discovery client", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              alpha: {
                baseURL: "https://alpha.example/v1",
                apiKeyRef: "dyn_alpha",
              },
            },
          }
        : { apiKeysSecrets: { dyn_alpha: "ciphertext" } },
    );
    const response = await POST(request("alpha"));
    expect(response.status).toBe(200);
    expect(mocks.decrypt).toHaveBeenCalledWith("ciphertext");
    expect(mocks.requestDiscovery).toHaveBeenCalledWith(
      "https://alpha.example/v1/models",
      "server-secret",
    );
    expect(await response.text()).not.toContain("server-secret");
  });

  it("rejects unauthenticated and cross-origin probes before network access", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect((await POST(request("google"))).status).toBe(401);
    const crossOrigin = new Request(
      "https://local.test/api/admin/providers/test",
      {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
        body: JSON.stringify({ provider: "google" }),
      },
    );
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(mocks.requestDiscovery).not.toHaveBeenCalled();
  });
});
