import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
  encrypt: vi.fn(),
  isEncryptionAvailable: vi.fn(),
  invalidate: vi.fn(),
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
  siteConfigRepository: { getConfig: mocks.getConfig, upsert: mocks.upsert },
}));
vi.mock("lib/security/encryption", () => ({
  encrypt: mocks.encrypt,
  isEncryptionAvailable: mocks.isEncryptionAvailable,
}));
vi.mock("lib/ai/models", () => ({
  invalidateDynamicModelsCache: mocks.invalidate,
  customModelProvider: { modelsInfo: [{ provider: "openai" }] },
}));

import { DELETE, GET, POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("https://local.test/api/admin/providers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://local.test",
    },
    body: JSON.stringify(body),
  });

describe("dynamic provider administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models" ? { dynamicProviders: {} } : { apiKeysSecrets: {} },
    );
    mocks.upsert.mockResolvedValue(undefined);
    mocks.encrypt.mockReturnValue("ciphertext-only");
    mocks.isEncryptionAvailable.mockReturnValue(true);
  });

  it("lists providers without exposing encrypted or plaintext credentials", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              alpha: {
                name: "Alpha",
                baseURL: "https://alpha.example/v1",
                apiKeyRef: "dyn_alpha",
                apiKey: "legacy-ciphertext",
                models: ["m1"],
                enabled: true,
              },
            },
          }
        : { apiKeysSecrets: { dyn_alpha: "ciphertext-secret" } },
    );
    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('"apiKeyConfigured":true');
    expect(text).not.toContain("ciphertext-secret");
    expect(text).not.toContain("legacy-ciphertext");
  });

  it("encrypts a new key, stores only a reference on the provider, and normalizes model ids", async () => {
    const response = await POST(
      makeRequest({
        name: "Example Gateway",
        baseURL: "https://gateway.example/v1/",
        apiKey: "secret-value",
        models: ["friendly-name", { name: "Friendly", apiModelId: "api-id" }],
        enabled: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.encrypt).toHaveBeenCalledWith("secret-value");
    const toolsWrite = mocks.upsert.mock.calls.find(([key]) => key === "tools");
    const modelsWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "models",
    );
    expect(toolsWrite?.[1].apiKeysSecrets["dyn_example-gateway"]).toBe(
      "ciphertext-only",
    );
    const saved = modelsWrite?.[1].dynamicProviders["example-gateway"];
    expect(saved.apiKeyRef).toBe("dyn_example-gateway");
    expect(saved.baseURL).toBe("https://gateway.example/v1");
    expect(saved.models).toEqual([
      { name: "friendly-name", apiModelId: "friendly-name" },
      { name: "Friendly", apiModelId: "api-id" },
    ]);
    const output = await response.text();
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("ciphertext-only");
  });

  it("retains the saved encrypted key when an update leaves the password field blank", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              alpha: {
                name: "Alpha",
                baseURL: "https://alpha.example/v1",
                apiKeyRef: "dyn_alpha",
                models: [],
                enabled: true,
              },
            },
          }
        : { apiKeysSecrets: { dyn_alpha: "saved-ciphertext" } },
    );
    const response = await POST(
      makeRequest({
        id: "alpha",
        name: "Alpha",
        baseURL: "https://alpha.example/v1",
        apiKey: "",
        enabled: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.encrypt).not.toHaveBeenCalled();
    const modelsWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "models",
    );
    expect(modelsWrite?.[1].dynamicProviders.alpha.apiKeyRef).toBe("dyn_alpha");
    expect(JSON.stringify(modelsWrite?.[1])).not.toContain("saved-ciphertext");
  });

  it("rejects cross-origin, insecure, malformed, and static-reserved providers", async () => {
    const crossOrigin = await POST(
      new Request("https://local.test/api/admin/providers", {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
        body: "{}",
      }),
    );
    expect(crossOrigin.status).toBe(403);
    expect(
      (
        await POST(
          makeRequest({ name: "No TLS", baseURL: "http://provider.example" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(makeRequest({ name: "Bad", baseURL: "not a URL" }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest({
            id: "openai",
            name: "Collision",
            baseURL: "https://provider.example",
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("requires admin permission and encryption for credential writes", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect(
      (
        await POST(
          makeRequest({
            name: "Alpha",
            baseURL: "https://alpha.example",
            apiKey: "secret",
          }),
        )
      ).status,
    ).toBe(401);
    mocks.isEncryptionAvailable.mockReturnValue(false);
    expect(
      (
        await POST(
          makeRequest({
            name: "Alpha",
            baseURL: "https://alpha.example",
            apiKey: "secret",
          }),
        )
      ).status,
    ).toBe(503);
  });

  it("deletes provider config and only its unshared managed key", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              alpha: { apiKeyRef: "dyn_alpha" },
              beta: { apiKeyRef: "dyn_alpha" },
            },
          }
        : { apiKeysSecrets: { dyn_alpha: "shared-ciphertext", keep: "other" } },
    );
    const response = await DELETE(
      new Request("https://local.test/api/admin/providers?id=alpha", {
        method: "DELETE",
        headers: { Origin: "https://local.test" },
      }),
    );
    expect(response.status).toBe(200);
    const modelWrite = mocks.upsert.mock.calls.find(
      ([key]) => key === "models",
    );
    expect(modelWrite?.[1].dynamicProviders).toEqual({
      beta: { apiKeyRef: "dyn_alpha" },
    });
    const toolsWrite = mocks.upsert.mock.calls.find(([key]) => key === "tools");
    expect(toolsWrite?.[1].apiKeysSecrets).toEqual({
      dyn_alpha: "shared-ciphertext",
      keep: "other",
    });
  });
});
