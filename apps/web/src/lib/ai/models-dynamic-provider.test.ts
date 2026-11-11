import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./register-gateway-provider", () => ({}));

const getConfig = vi.fn();
const getPreferences = vi.fn();
const decrypt = vi.fn((value: string) => `decrypted:${value}`);
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig },
  userRepository: { getPreferences },
}));
vi.mock("lib/security/encryption", () => ({ decrypt }));

describe("admin-managed AI model providers", () => {
  beforeEach(() => {
    vi.resetModules();
    getConfig.mockReset();
    getPreferences.mockReset();
    decrypt.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates an enabled provider, decrypts its referenced key, and resolves it", async () => {
    getConfig.mockImplementation(async (key: string) => {
      if (key === "models") {
        return {
          dynamicProviders: {
            "acme-ai": {
              name: "Acme AI",
              enabled: true,
              baseURL: "https://models.example/v1",
              apiKeyRef: "acme-key",
              models: [{ name: "Acme Reasoner", apiModelId: "reasoner-v2" }],
            },
          },
        };
      }
      if (key === "tools")
        return { apiKeysSecrets: { "acme-key": "ciphertext" } };
      return null;
    });

    const { customModelProvider } = await import("./models");
    const model = await customModelProvider.getModelAsync({
      provider: "acme-ai",
      model: "Acme Reasoner",
    });

    expect(decrypt).toHaveBeenCalledWith("ciphertext");
    expect(typeof model).not.toBe("string");
    expect((model as { modelId: string }).modelId).toBe("reasoner-v2");
    expect((model as { provider: string }).provider).toContain("acme-ai");
    expect(
      customModelProvider.modelsInfo.find(
        (entry) => entry.provider === "acme-ai",
      ),
    ).toMatchObject({
      hasAPIKey: true,
      models: [
        {
          name: "Acme Reasoner",
          isToolCallUnsupported: true,
          isImageInputUnsupported: true,
          supportedFileMimeTypes: [],
        },
      ],
    });
  });

  it("does not register a provider when a referenced key cannot be decrypted", async () => {
    getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              "locked-provider": {
                enabled: true,
                baseURL: "https://models.example/v1",
                apiKeyRef: "missing-key",
                models: [{ name: "Private Model", apiModelId: "private-v1" }],
              },
            },
          }
        : { apiKeysSecrets: {} },
    );

    const { customModelProvider } = await import("./models");
    const resolved = await customModelProvider.getModelAsync({
      provider: "locked-provider",
      model: "Private Model",
    });

    expect(typeof resolved).toBe("string");
    expect(
      customModelProvider.modelsInfo.some(
        (entry) => entry.provider === "locked-provider",
      ),
    ).toBe(false);
  });

  it("rejects reserved provider ids and unsupported URL protocols", async () => {
    getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              openai: {
                enabled: true,
                baseURL: "https://attacker.example/v1",
                apiKeyRef: "",
                models: [{ name: "Shadow", apiModelId: "shadow" }],
              },
              "bad-protocol": {
                enabled: true,
                baseURL: "file:///etc/passwd",
                apiKeyRef: "",
                models: [{ name: "Local File", apiModelId: "local" }],
              },
            },
          }
        : null,
    );

    const { customModelProvider } = await import("./models");
    await customModelProvider.getModelAsync({
      provider: "openai",
      model: "Shadow",
    });
    await customModelProvider.getModelAsync({
      provider: "bad-protocol",
      model: "Local File",
    });

    expect(
      customModelProvider.modelsInfo.some(
        (entry) =>
          entry.provider === "openai" &&
          entry.models.some((model) => model.name === "Shadow"),
      ),
    ).toBe(false);
    expect(
      customModelProvider.modelsInfo.some(
        (entry) => entry.provider === "bad-protocol",
      ),
    ).toBe(false);
  });

  it("fails closed for personal Local Models instead of using deployment fallback", async () => {
    const { customModelProvider } = await import("./models");
    await expect(
      customModelProvider.getModelWithFailureFallbackAsync({
        provider: "Local Models",
        model: "private-local-model",
      }),
    ).rejects.toThrow("User ID required for Local Models");
  });

  it("keeps authenticated Local Models on the user's configured endpoint", async () => {
    getPreferences.mockResolvedValue({
      localModels: {
        enabled: true,
        type: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        models: [{ name: "private-llama" }],
      },
    });

    const { getModelInstance } = await import("./models");
    const model = await getModelInstance(
      { provider: "Local Models", model: "private-llama" },
      "user-123",
    );

    expect(getPreferences).toHaveBeenCalledWith("user-123");
    expect(typeof model).not.toBe("string");
    expect((model as { modelId: string }).modelId).toBe("private-llama");
  });
});
