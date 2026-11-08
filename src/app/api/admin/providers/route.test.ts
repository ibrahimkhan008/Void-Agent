import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
  encrypt: vi.fn(),
  isEncryptionAvailable: vi.fn(),
  invalidateDynamicProviderHydration: vi.fn(),
  invalidateSiteConfigCache: vi.fn(),
}));

vi.mock("lib/ai/models", () => ({
  invalidateDynamicProviderHydration: mocks.invalidateDynamicProviderHydration,
}));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: mocks.getConfig,
    upsert: mocks.upsert,
  },
}));
vi.mock("lib/security/encryption", () => ({
  encrypt: mocks.encrypt,
  isEncryptionAvailable: mocks.isEncryptionAvailable,
}));
vi.mock("lib/site-config", () => ({
  invalidateSiteConfigCache: mocks.invalidateSiteConfigCache,
}));

import { GET, POST } from "./route";

describe("GET /api/admin/providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue(undefined);
  });

  it("reports fallback-only saved credentials without exposing the secret", async () => {
    const encryptedSecret = "encrypted-fallback-secret";
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              "gateway-one": {
                name: "Gateway",
                baseURL: "https://provider.example/v1",
                models: ["model-a"],
              },
            },
          }
        : { apiKeysSecrets: { "dyn_gateway-one": encryptedSecret } },
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providers).toEqual([
      expect.objectContaining({ id: "gateway-one", apiKeyConfigured: true }),
    ]);
    expect(JSON.stringify(body)).not.toContain(encryptedSecret);
  });

  it("keeps listing direct-key providers when the optional tools config read fails", async () => {
    mocks.getConfig.mockImplementation(async (key: string) => {
      if (key === "tools") throw new Error("tools config unavailable");
      return {
        dynamicProviders: {
          "gateway-one": { apiKey: "encrypted-direct-key" },
        },
      };
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providers).toEqual([
      expect.objectContaining({ id: "gateway-one", apiKeyConfigured: true }),
    ]);
  });
});

describe("POST /api/admin/providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.isEncryptionAvailable.mockReturnValue(true);
    mocks.encrypt.mockReturnValue("encrypted-new-key");
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              "gateway-one": {
                name: "Old name",
                baseURL: "https://provider.example/v1",
                apiKey: "encrypted-saved-key",
                models: ["old-model"],
                enabled: false,
                addedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          }
        : { apiKeysSecrets: {} },
    );
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("updates the existing curated provider ID and retains its encrypted key when blank", async () => {
    const response = await POST(
      new Request("https://app.example/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "gateway-one",
          name: "Renamed gateway",
          baseURL: "https://provider.example/v2",
          apiKey: "",
          models: ["new-model"],
          enabled: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ success: true, id: "gateway-one" });
    const modelsWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "models",
    );
    expect(modelsWrite?.[1].dynamicProviders["gateway-one"]).toEqual({
      name: "Renamed gateway",
      baseURL: "https://provider.example/v2",
      models: ["new-model"],
      enabled: false,
      addedAt: "2026-01-01T00:00:00.000Z",
      apiKey: "encrypted-saved-key",
    });
    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(responseBody)).not.toContain("encrypted-saved-key");
  });

  it("encrypts a replacement key while keeping the configured provider ID", async () => {
    const response = await POST(
      new Request("https://app.example/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "gateway-one",
          name: "Gateway",
          baseURL: "https://provider.example/v1",
          apiKey: "replacement-secret",
          models: ["model-a"],
          enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, id: "gateway-one" });
    expect(mocks.encrypt).toHaveBeenCalledWith("replacement-secret");
    const modelsWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "models",
    );
    expect(modelsWrite?.[1].dynamicProviders["gateway-one"].apiKey).toBe(
      "encrypted-new-key",
    );
  });
});
