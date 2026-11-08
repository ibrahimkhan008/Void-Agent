import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  ensureDynamic: vi.fn(),
  getConfig: vi.fn(),
  listUserProviders: vi.fn(),
  modelsInfo: [
    { provider: "flare", hasAPIKey: true, models: [{ name: "Model A" }] },
    { provider: "google", hasAPIKey: true, models: [{ name: "Model B" }] },
    {
      provider: "custom-gateway",
      hasAPIKey: true,
      models: [{ name: "Model C" }],
    },
  ],
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    get modelsInfo() {
      return mocks.modelsInfo;
    },
  },
  ensureDynamicProvidersHydrated: mocks.ensureDynamic,
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
  userModelProviderRepository: { listForUser: mocks.listUserProviders },
}));
vi.mock("lib/ai/sort-providers", () => ({
  sortProvidersFlareFirst: (providers: unknown[]) => providers,
}));

import { GET } from "./route";

describe("GET /api/chat/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.ensureDynamic.mockResolvedValue(undefined);
    mocks.getConfig.mockResolvedValue({
      providers: { Flare: { enabled: false } },
      dynamicProviders: {
        "custom-gateway": {
          enabled: true,
          apiKey: "server-secret-must-not-be-returned",
        },
      },
      modelDisplayMetadata: {},
    });
    mocks.listUserProviders.mockResolvedValue([]);
  });

  it("requires a signed-in session", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("does not advertise disabled providers and preserves enabled static/dynamic providers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const providers = await response.json();
    expect(
      providers.map((provider: { provider: string }) => provider.provider),
    ).toEqual(["google", "custom-gateway"]);
  });

  it("adds only the signed-in user's personal provider models to the catalog", async () => {
    mocks.listUserProviders.mockResolvedValueOnce([
      {
        id: "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
        name: "My gateway",
        hasApiKey: true,
        modelIds: ["private-model"],
        capabilities: {
          "private-model": { supportsToolCalling: true },
        },
      },
    ]);
    const providers = await (await GET()).json();
    expect(providers.at(-1)).toMatchObject({
      provider: "user-9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
      displayName: "My gateway",
      models: [
        {
          name: "private-model",
          isToolCallUnsupported: false,
          isImageInputUnsupported: true,
        },
      ],
    });
    expect(mocks.listUserProviders).toHaveBeenCalledWith("user-1");
  });

  it("defaults legacy personal model records to tool-disabled", async () => {
    mocks.listUserProviders.mockResolvedValueOnce([
      {
        id: "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
        name: "Legacy gateway",
        hasApiKey: false,
        modelIds: ["legacy-model"],
      },
    ]);
    const providers = await (await GET()).json();
    expect(providers.at(-1).models[0]).toMatchObject({
      name: "legacy-model",
      isToolCallUnsupported: true,
      isImageInputUnsupported: true,
    });
  });

  it("adds validated public metadata only to returned models and omits provider secrets", async () => {
    mocks.getConfig.mockResolvedValueOnce({
      providers: { Flare: { enabled: false } },
      dynamicProviders: {
        "custom-gateway": {
          enabled: true,
          apiKey: "server-secret-must-not-be-returned",
        },
      },
      modelDisplayMetadata: {
        "GOOGLE/Model B": {
          developer: "Google",
          country: "US",
          hiddenGem: true,
          inputPriceUsd: 0.4,
          outputPriceUsd: 1.2,
          automaticRoutingPriority: 2,
          automaticRoutingScores: { coding: 90, reasoning: 40 },
        },
        "google/not-in-catalog": { speed: true },
      },
    });
    const response = await GET();
    const providers = await response.json();
    const google = providers.find(
      (provider: { provider: string }) => provider.provider === "google",
    );

    expect(google.models[0].displayMetadata).toEqual({
      developer: "Google",
      country: "US",
      hiddenGem: true,
      inputPriceUsd: 0.4,
      outputPriceUsd: 1.2,
      automaticRoutingPriority: 2,
      automaticRoutingScores: { coding: 90, reasoning: 40 },
    });
    expect(JSON.stringify(providers)).not.toContain("server-secret");
    expect(JSON.stringify(providers)).not.toContain("not-in-catalog");
  });

  it("fails closed when provider enablement cannot be verified", async () => {
    mocks.getConfig.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
  });
});
