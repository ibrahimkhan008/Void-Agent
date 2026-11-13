import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAdminPermission: vi.fn(),
  rateLimit: vi.fn(),
  getConfig: vi.fn(),
  getAll: vi.fn(),
  upsert: vi.fn(),
  invalidate: vi.fn(),
  modelsInfo: vi.fn(),
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
  siteConfigRepository: {
    getConfig: mocks.getConfig,
    getAll: mocks.getAll,
    upsert: mocks.upsert,
  },
}));
vi.mock("lib/ai/models", () => ({
  invalidateDynamicModelsCache: mocks.invalidate,
  customModelProvider: {
    get modelsInfo() {
      return mocks.modelsInfo();
    },
  },
}));

import { GET, POST } from "./route";

const postRequest = (body: unknown, origin = "https://local.test") =>
  new Request("https://local.test/api/admin/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });

const MODEL_CATALOG = [
  {
    provider: "voidagent",
    models: [{ name: "Claude Opus 4.6" }, { name: "Gemini 3 Flash" }],
    hasAPIKey: true,
  },
  {
    provider: "groq",
    models: [{ name: "Llama 4 17b Scout" }],
    hasAPIKey: false,
  },
];

describe("admin config route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.upsert.mockResolvedValue(undefined);
    mocks.modelsInfo.mockReturnValue(MODEL_CATALOG);
    mocks.getAll.mockResolvedValue({});
    mocks.getConfig.mockResolvedValue(null);
    delete process.env.EXA_API_KEY;
  });

  it("returns merged sections and never leaks apiKeysSecrets or provider key material", async () => {
    mocks.getAll.mockResolvedValue({
      tools: {
        categories: { Code: { enabled: false, tools: {} } },
        apiKeys: { exa: true },
        apiKeysSecrets: { exa: "encrypted-ciphertext", dyn_alpha: "hidden" },
        dynamicTools: { github: { name: "GitHub" } },
      },
      models: {
        dynamicProviders: {
          alpha: {
            name: "Alpha",
            baseURL: "https://alpha.example/v1",
            apiKeyRef: "dyn_alpha",
            apiKey: "legacy-ciphertext",
            models: [{ name: "Alpha Mini", apiModelId: "alpha-mini" }],
            enabled: true,
          },
        },
        fallbackModel: "void-agent/Gemini 3 Flash",
      },
      general: { appName: "Custom Name" },
    });
    process.env.EXA_API_KEY = "env-value";

    const response = await GET();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Section defaults merge with DB overrides.
    expect(body.config.general.appName).toBe("Custom Name");
    expect(body.config.tools.categories.Code.enabled).toBe(false);
    expect(body.config.tools.apiKeys.exa).toBe(true);
    expect(body.config.tools.dynamicTools.github.name).toBe("GitHub");
    // Secrets never leave the server.
    expect(text).not.toContain("encrypted-ciphertext");
    expect(text).not.toContain("legacy-ciphertext");
    expect(text).not.toContain("apiKeysSecrets");
    expect(body.config.tools.apiKeysSecrets).toBeUndefined();
    // Built-in providers come from the runtime catalog with the first model
    // as default; dynamic providers are rendered separately from the DB.
    expect(body.config.models.providers.voidagent).toMatchObject({
      enabled: true,
      apiKeyConfigured: true,
      defaultModel: "Claude Opus 4.6",
      isDynamic: false,
    });
    expect(body.config.models.providers.groq.apiKeyConfigured).toBe(false);
    expect(body.config.models.dynamicProviders.alpha).toMatchObject({
      name: "Alpha",
      apiKeyConfigured: true,
      enabled: true,
      models: ["Alpha Mini"],
      apiKeyRef: "dyn_alpha",
    });
    // Legacy "provider/model" fallback strings migrate to the chain format.
    expect(body.config.models.fallbackModel).toBe("void-agent/Gemini 3 Flash");
  });

  it("marks dynamic provider keys absent when no secret or env reference resolves", async () => {
    mocks.getAll.mockResolvedValue({
      models: {
        dynamicProviders: {
          beta: {
            name: "Beta",
            baseURL: "https://beta.example/v1",
            apiKeyRef: "dyn_beta",
            models: [],
            enabled: false,
          },
        },
      },
    });
    const body = await (await GET()).json();
    expect(body.config.models.dynamicProviders.beta.apiKeyConfigured).toBe(
      false,
    );
  });

  it("saves a section for an authorized same-origin admin", async () => {
    const response = await POST(
      postRequest({ key: "general", settings: { appName: "Renamed" } }),
    );
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      "general",
      { appName: "Renamed" },
      "admin-1",
    );
  });

  it("preserves stored secrets when the tools section is saved", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "tools"
        ? {
            apiKeysSecrets: { exa: "stored-ciphertext", dyn_alpha: "keep" },
            categories: { Code: { enabled: true, tools: {} } },
          }
        : null,
    );
    const response = await POST(
      postRequest({
        key: "tools",
        settings: {
          categories: { Code: { enabled: false, tools: {} } },
          // A malicious or buggy client must not be able to rewrite secrets.
          apiKeysSecrets: { exa: "attacker-ciphertext" },
        },
      }),
    );
    expect(response.status).toBe(200);
    const write = mocks.upsert.mock.calls.find(([key]) => key === "tools");
    expect(write?.[1].apiKeysSecrets).toEqual({
      exa: "stored-ciphertext",
      dyn_alpha: "keep",
    });
  });

  it("merges model section fields, restores missing key references, and refreshes the runtime cache", async () => {
    mocks.getConfig.mockImplementation(async (key: string) =>
      key === "models"
        ? {
            dynamicProviders: {
              alpha: {
                name: "Alpha",
                baseURL: "https://alpha.example/v1",
                apiKeyRef: "dyn_alpha",
                enabled: true,
                models: [],
              },
            },
            modelPricing: { legacy: true },
          }
        : null,
    );
    const response = await POST(
      postRequest({
        key: "models",
        settings: {
          providers: { voidagent: { enabled: false } },
          dynamicProviders: {
            alpha: { name: "Alpha Renamed", enabled: true, models: [] },
          },
        },
      }),
    );
    expect(response.status).toBe(200);
    const write = mocks.upsert.mock.calls.find(([key]) => key === "models");
    // Shallow section merge keeps fields the UI does not manage.
    expect(write?.[1].modelPricing).toEqual({ legacy: true });
    expect(write?.[1].providers).toEqual({ voidagent: { enabled: false } });
    expect(write?.[1].dynamicProviders.alpha.apiKeyRef).toBe("dyn_alpha");
    expect(write?.[1].dynamicProviders.alpha.apiKey).toBeUndefined();
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthorized, cross-origin, rate-limited, and malformed writes", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect(
      (await POST(postRequest({ key: "general", settings: {} }))).status,
    ).toBe(401);

    mocks.requireAdminPermission.mockResolvedValue(undefined);
    expect(
      (
        await POST(
          postRequest(
            { key: "general", settings: {} },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);

    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect(
      (await POST(postRequest({ key: "general", settings: {} }))).status,
    ).toBe(429);

    expect(
      (await POST(postRequest({ key: "not-a-key", settings: {} }))).status,
    ).toBe(400);
    expect(
      (await POST(postRequest({ key: "general", settings: "nope" }))).status,
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated config reads", async () => {
    mocks.requireAdminPermission.mockRejectedValueOnce(new Error("forbidden"));
    expect((await GET()).status).toBe(401);
  });
});
