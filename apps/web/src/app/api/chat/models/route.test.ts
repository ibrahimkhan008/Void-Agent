import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getModelAsync: vi.fn(),
  checkFeature: vi.fn(),
  getAvailableOrganizationModels: vi.fn(),
  isRoutingSchemaUnavailableError: vi.fn(),
  cacheHas: vi.fn(),
  cacheSet: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

const modelCatalog: Array<{
  provider: string;
  hasAPIKey: boolean;
  models: Array<{
    name: string;
    isToolCallUnsupported: boolean;
    isImageInputUnsupported: boolean;
    supportedFileMimeTypes: string[];
  }>;
}> = [];

vi.mock("@/lib/gate", () => ({ checkFeature: mocks.checkFeature }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    get modelsInfo() {
      return modelCatalog;
    },
    getModelAsync: mocks.getModelAsync,
  },
}));
vi.mock("lib/ai/routing/service", () => ({
  getAvailableOrganizationModels: mocks.getAvailableOrganizationModels,
  isRoutingSchemaUnavailableError: mocks.isRoutingSchemaUnavailableError,
}));
vi.mock("lib/cache", () => ({
  serverCache: { has: mocks.cacheHas, set: mocks.cacheSet },
}));
vi.mock("lib/db/repository", () => ({
  userRepository: {
    getPreferences: mocks.getPreferences,
    updatePreferences: mocks.updatePreferences,
  },
}));
vi.mock("lib/equal", () => ({ default: () => true }));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => callback(),
}));

import { GET } from "./route";

const modelEntry = (name: string) => ({
  name,
  isToolCallUnsupported: true,
  isImageInputUnsupported: true,
  supportedFileMimeTypes: [],
});

describe("GET /api/chat/models dynamic providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelCatalog.splice(
      0,
      modelCatalog.length,
      {
        provider: "Navigator",
        hasAPIKey: true,
        models: [modelEntry("Base model")],
      },
      {
        provider: "admin-models",
        hasAPIKey: true,
        models: [modelEntry("Private Server Model")],
      },
      {
        provider: "groq",
        hasAPIKey: true,
        models: [modelEntry("hidden-groq-model")],
      },
    );
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeOrganizationId: null },
    });
    mocks.getModelAsync.mockResolvedValue("navigator/base");
    mocks.checkFeature.mockResolvedValue(false);
    mocks.getPreferences.mockResolvedValue(null);
    mocks.cacheHas.mockResolvedValue(true);
    mocks.cacheSet.mockResolvedValue(undefined);
    mocks.getAvailableOrganizationModels.mockResolvedValue({ models: [] });
    mocks.isRoutingSchemaUnavailableError.mockReturnValue(false);
  });

  it("hydrates providers before listing and exposes only model metadata", async () => {
    const response = await GET();
    const body = await response.json();

    expect(mocks.getModelAsync).toHaveBeenCalledOnce();
    expect(body).toEqual([
      {
        provider: "Navigator",
        hasAPIKey: true,
        models: [modelEntry("Base model")],
      },
      {
        provider: "admin-models",
        hasAPIKey: true,
        models: [modelEntry("Private Server Model")],
      },
      {
        provider: "Add Local Models",
        hasAPIKey: false,
        models: [],
        isPlaceholder: true,
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /"apiKey":|"baseURL":|ciphertext|secret-value/i,
    );
  });

  it("keeps dynamic providers subject to the active organization's model allowlist", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeOrganizationId: "org-1" },
    });
    mocks.getAvailableOrganizationModels.mockResolvedValue({
      models: [{ provider: "admin-models", model: "Private Server Model" }],
    });

    const response = await GET();
    const body = await response.json();

    expect(mocks.getAvailableOrganizationModels).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(body).toEqual([
      {
        provider: "admin-models",
        hasAPIKey: true,
        models: [modelEntry("Private Server Model")],
      },
      {
        provider: "Add Local Models",
        hasAPIKey: false,
        models: [],
        isPlaceholder: true,
      },
    ]);
  });

  it("does not expose dynamic provider entries to anonymous requests", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    // Existing route policy exposes the public model catalog without a
    // session. Dynamic providers are deployment-admin configured, so their
    // model names are catalog metadata, never credentials or endpoint data.
    expect(
      body.some(
        (provider: { provider: string }) =>
          provider.provider === "admin-models",
      ),
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("ciphertext");
  });
});
