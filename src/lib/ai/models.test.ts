import { beforeAll, describe, expect, it, vi } from "vitest";
import { GEMINI_FILE_MIME_TYPES } from "./file-support";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
}));

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
    const boundedProvider = customModelProvider.modelsInfo.find(
      (provider) => provider.provider === "boundedgateway",
    );
    expect(boundedProvider?.models).toHaveLength(100);
    expect(boundedProvider?.models.every((model) => model.name.length <= 200)).toBe(
      true,
    );

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
