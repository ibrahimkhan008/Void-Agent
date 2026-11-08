import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  getSession: vi.fn(),
  getConfig: vi.fn(),
  upsert: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/admin/site-config-defaults", () => ({
  CONFIG_KEYS: ["models"],
}));
vi.mock("lib/admin/site-config-reader", () => ({
  invalidateAdminConfigCache: mocks.invalidateCache,
}));
vi.mock("lib/ai/model-pricing.server", () => ({
  validateModelPricingMap: (value: unknown) => value,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { modelsInfo: [] },
  ensureDynamicProvidersHydrated: vi.fn(),
  setAdminFallbackChain: vi.fn(),
}));
vi.mock("lib/ai/team-member-ai-budget-gate", () => ({
  isValidTeamMemberBudgetRolloutValue: (value: unknown) =>
    typeof value === "boolean",
}));
vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("lib/auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: mocks.getConfig,
    upsert: mocks.upsert,
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/config model display metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.getConfig.mockResolvedValue({
      providers: { openai: { enabled: true } },
      modelPricing: { "openai/model": { currency: "EUR" } },
    });
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("validates and saves display metadata while preserving existing model settings", async () => {
    const response = await POST(
      request({
        key: "models",
        settings: {
          modelDisplayMetadata: {
            "openai/model": {
              developer: "OpenAI",
              country: "US",
              inputPriceUsd: 0.5,
              automaticRoutingPriority: 4,
              automaticRoutingContextTokens: 128_000,
              automaticRoutingScores: { coding: 80 },
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      "models",
      expect.objectContaining({
        providers: { openai: { enabled: true } },
        modelPricing: { "openai/model": { currency: "EUR" } },
        modelDisplayMetadata: {
          "openai/model": {
            developer: "OpenAI",
            country: "US",
            inputPriceUsd: 0.5,
            automaticRoutingPriority: 4,
            automaticRoutingContextTokens: 128_000,
            automaticRoutingScores: { coding: 80 },
          },
        },
      }),
      "admin-1",
    );
  });

  it("rejects invalid metadata without writing configuration", async () => {
    const response = await POST(
      request({
        key: "models",
        settings: {
          modelDisplayMetadata: {
            "openai/model": { inputPriceUsd: -2 },
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects automatic-routing scores outside the catalog schema", async () => {
    const response = await POST(
      request({
        key: "models",
        settings: {
          modelDisplayMetadata: {
            "openai/model": {
              automaticRoutingScores: { coding: 101 },
            },
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects unverified context sizes outside the catalog bounds", async () => {
    const response = await POST(
      request({
        key: "models",
        settings: {
          modelDisplayMetadata: {
            "openai/model": {
              automaticRoutingContextTokens: 0,
            },
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
