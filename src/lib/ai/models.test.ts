import { beforeAll, describe, expect, it, vi } from "vitest";
import { GEMINI_FILE_MIME_TYPES } from "./file-support";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn().mockResolvedValue(null),
  getSession: vi.fn(),
  getUserProvider: vi.fn(),
  getUserProviderCapabilities: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
  userModelProviderRepository: {
    getForRuntime: mocks.getUserProvider,
    getCapabilitiesForModel: mocks.getUserProviderCapabilities,
  },
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));

vi.mock("server-only", () => ({}));

let modelsModule: typeof import("./models");

beforeAll(async () => {
  modelsModule = await import("./models");
});

describe("customModelProvider file support metadata", () => {
  it("includes default file support for Google Gemini 3 Flash", () => {
    const modelName = "Gemini 3 Flash";
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "google",
      model: modelName,
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );

    const googleProvider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "google",
    );
    const metadata = googleProvider?.models.find(
      (item) => item.name === modelName,
    );

    expect(metadata?.supportedFileMimeTypes).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );
  });

  it("does not advertise native image file support for GLM 4.7", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "zAI",
      model: "GLM 4.7",
    });

    expect(getFilePartSupportedMimeTypes(model)).toEqual([]);

    const provider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "zAI",
    );
    const metadata = provider?.models.find((item) => item.name === "GLM 4.7");

    expect(metadata?.supportedFileMimeTypes).toEqual([]);
    expect(metadata?.isImageInputUnsupported).toBe(true);
  });

  it("does not advertise native image file support for GLM 5.1", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "zAI",
      model: "GLM 5.1",
    });

    expect(getFilePartSupportedMimeTypes(model)).toEqual([]);

    const provider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "zAI",
    );
    const metadata = provider?.models.find((item) => item.name === "GLM 5.1");

    expect(metadata?.supportedFileMimeTypes).toEqual([]);
    expect(metadata?.isImageInputUnsupported).toBe(true);
  });

  it("wraps stale canvas model fallback without an undefined fallback provider crash", () => {
    const { customModelProvider } = modelsModule;

    expect(() =>
      customModelProvider.getModelWithFailureFallback({
        provider: "openai",
        model: "GPT 5.2",
      }),
    ).not.toThrow();
  });

  it("hydrates an enabled provider before first model resolution and removes it when disabled", async () => {
    const {
      customModelProvider,
      ensureDynamicProvidersHydrated,
      invalidateDynamicProviderHydration,
    } = modelsModule;
    mocks.getConfig
      .mockReset()
      .mockResolvedValueOnce({
        dynamicProviders: {
          testgateway: {
            enabled: true,
            baseURL: "https://models.example.test/v1",
            models: ["Aurora Test"],
          },
          disabledgateway: {
            enabled: false,
            baseURL: "https://disabled.example.test/v1",
            models: ["Hidden Test"],
          },
          legacygateway: {
            baseURL: "https://legacy.example.test/v1",
            models: ["Legacy Hidden Test"],
          },
          boundedgateway: {
            enabled: true,
            baseURL: "https://bounded.example.test/v1",
            models: [
              "x".repeat(201),
              ...Array.from({ length: 101 }, (_, index) => `Bounded ${index}`),
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        dynamicProviders: {
          testgateway: {
            enabled: false,
            baseURL: "https://models.example.test/v1",
            models: ["Aurora Test"],
          },
        },
      });

    invalidateDynamicProviderHydration();
    await ensureDynamicProvidersHydrated();
    const model = await customModelProvider.getModelAsync({
      provider: "testgateway",
      model: "Aurora Test",
    });
    expect(model).toMatchObject({
      provider: "testgateway.chat",
      modelId: "Aurora Test",
    });
    const unconfiguredModel = await customModelProvider.getModelAsync({
      provider: "testgateway",
      model: "Not Configured",
    });
    expect(unconfiguredModel).not.toMatchObject({
      provider: "testgateway.chat",
    });
    expect(
      customModelProvider.modelsInfo.some(
        (provider) => provider.provider === "disabledgateway",
      ),
    ).toBe(false);
    expect(
      customModelProvider.modelsInfo.some(
        (provider) => provider.provider === "legacygateway",
      ),
    ).toBe(false);
    const boundedProvider = customModelProvider.modelsInfo.find(
      (provider) => provider.provider === "boundedgateway",
    );
    expect(boundedProvider?.models).toHaveLength(100);
    expect(
      boundedProvider?.models.every((model) => model.name.length <= 200),
    ).toBe(true);

    invalidateDynamicProviderHydration();
    await ensureDynamicProvidersHydrated();
    const disabledModel = await customModelProvider.getModelAsync({
      provider: "testgateway",
      model: "Aurora Test",
    });
    expect(disabledModel).not.toMatchObject({ provider: "testgateway.chat" });
    expect(
      customModelProvider.modelsInfo.some(
        (provider) => provider.provider === "testgateway",
      ),
    ).toBe(false);
  });

  it("does not let an in-flight stale read override configuration invalidation", async () => {
    const {
      customModelProvider,
      ensureDynamicProvidersHydrated,
      invalidateDynamicProviderHydration,
    } = modelsModule;
    let releaseFirstRead: ((config: unknown) => void) | undefined;
    mocks.getConfig
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRead = resolve;
          }),
      )
      .mockResolvedValueOnce({ dynamicProviders: {} });

    invalidateDynamicProviderHydration();
    const oldRead = ensureDynamicProvidersHydrated();
    await vi.waitFor(() => expect(mocks.getConfig).toHaveBeenCalledOnce());
    invalidateDynamicProviderHydration();
    const refresh = ensureDynamicProvidersHydrated();
    releaseFirstRead?.({
      dynamicProviders: {
        stalegateway: {
          enabled: true,
          baseURL: "https://stale.example.test/v1",
          models: ["Stale Test"],
        },
      },
    });

    await Promise.all([oldRead, refresh]);
    expect(mocks.getConfig).toHaveBeenCalledTimes(2);
    expect(
      customModelProvider.modelsInfo.some(
        (provider) => provider.provider === "stalegateway",
      ),
    ).toBe(false);
  });
});

describe("personal model provider runtime resolution", () => {
  it("does not apply deployment-wide fallback to user-owned models", () => {
    expect(
      modelsModule.shouldUseGlobalFailureFallback({
        provider: "user-9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
        model: "private-model",
      }),
    ).toBe(false);
    expect(
      modelsModule.shouldUseGlobalFailureFallback({
        provider: "google",
        model: "Gemini 3 Flash",
      }),
    ).toBe(true);
  });

  it("resolves only an exact model owned by the authenticated session", async () => {
    const id = "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658";
    mocks.getSession.mockResolvedValue({ user: { id: "owner-a" } });
    mocks.getUserProvider.mockResolvedValue({
      id,
      name: "Personal gateway",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret",
      modelIds: ["model-a"],
    });

    const model = await modelsModule.customModelProvider.getModelAsync({
      provider: `user-${id}`,
      model: "model-a",
    });
    expect((model as { modelId?: string }).modelId).toBe("model-a");
    expect(mocks.getUserProvider).toHaveBeenCalledWith("owner-a", id);

    mocks.getUserProvider.mockResolvedValueOnce(null);
    await expect(
      modelsModule.customModelProvider.getModelAsync({
        provider: `user-${id}`,
        model: "model-a",
      }),
    ).rejects.toThrow("Personal model provider is unavailable");
  });

  it("allows personal-provider tool calling only for an explicitly enabled owned model", async () => {
    const model = {
      provider: "user-9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
      model: "model-a",
    };
    mocks.getUserProviderCapabilities.mockResolvedValueOnce({
      supportsToolCalling: true,
    });
    expect(
      await modelsModule.supportsToolCallingForChatModel(
        "owner-a",
        model,
        {} as never,
      ),
    ).toBe(true);
    expect(mocks.getUserProviderCapabilities).toHaveBeenCalledWith(
      "owner-a",
      "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
      "model-a",
    );

    mocks.getUserProviderCapabilities.mockResolvedValueOnce(null);
    expect(
      await modelsModule.supportsToolCallingForChatModel(
        "owner-a",
        model,
        {} as never,
      ),
    ).toBe(false);
  });

  it("fails closed for malformed personal provider IDs", async () => {
    mocks.getUserProviderCapabilities.mockClear();
    expect(
      await modelsModule.supportsToolCallingForChatModel(
        "owner-a",
        { provider: "user-not-a-uuid", model: "model-a" },
        {} as never,
      ),
    ).toBe(false);
    expect(mocks.getUserProviderCapabilities).not.toHaveBeenCalled();
  });
});

describe("provider availability in the failure fallback chain", () => {
  it("filters disabled configured providers and keeps legacy-enabled statics", () => {
    const config = {
      providers: {
        openai: { enabled: false },
        groq: { enabled: true },
      },
      dynamicProviders: {
        disabledgateway: { enabled: false },
        enabledgateway: { enabled: true },
      },
    };
    const enabled = (provider: string) =>
      modelsModule.isFallbackProviderEnabled(provider, config);

    expect(
      modelsModule.filterFallbackEntries(
        [
          { provider: "openai", model: "GPT 5.2" },
          { provider: "groq", model: "Llama 4 Scout" },
          { provider: "disabledgateway", model: "private" },
          { provider: "enabledgateway", model: "approved" },
        ],
        enabled,
      ),
    ).toEqual([
      { provider: "groq", model: "Llama 4 Scout" },
      { provider: "enabledgateway", model: "approved" },
    ]);
    expect(
      modelsModule.isFallbackProviderEnabled("anthropic", {
        providers: {},
      }),
    ).toBe(true);
    expect(
      modelsModule.isFallbackProviderEnabled("disabledgateway", {
        dynamicProviders: { disabledgateway: {} },
      }),
    ).toBe(false);
  });

  it("keeps the selected model without fallback when admin state cannot be read", async () => {
    const { customModelProvider, invalidateDynamicProviderHydration } =
      modelsModule;
    mocks.getConfig
      .mockReset()
      .mockRejectedValueOnce(new Error("config unavailable"))
      .mockRejectedValueOnce(new Error("config unavailable"));
    invalidateDynamicProviderHydration();
    const selected = customModelProvider.getModel({
      provider: "openai",
      model: "GPT 5.2",
    });

    const resolved = await customModelProvider.getModelWithFailureFallbackAsync(
      {
        provider: "openai",
        model: "GPT 5.2",
      },
    );

    expect(resolved).toBe(selected);
  });
});
