import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfigMock, ensureHydratedMock, modelInfos } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  ensureHydratedMock: vi.fn(),
  modelInfos: [] as Array<{
    provider: string;
    hasAPIKey: boolean;
    models: Array<{ name: string }>;
  }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: getConfigMock },
}));
vi.mock("lib/ai/models", () => ({
  ensureDynamicProvidersHydrated: ensureHydratedMock,
  customModelProvider: {
    get modelsInfo() {
      return modelInfos;
    },
  },
}));

import { resolveTeamMemberBudgetGate } from "../team-member-ai-budget-gate";
import {
  AgentPinnedModelUnavailableError,
  getEnabledAgentModelCatalog,
  parsePinnedAgentModel,
  resolveAgentChatModel,
} from "./pinned-model";

describe("agent pinned model selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelInfos.splice(
      0,
      modelInfos.length,
      {
        provider: "flare",
        hasAPIKey: true,
        models: [{ name: "openai/gpt-oss-120b" }, { name: "disabled" }],
      },
      {
        provider: "google",
        hasAPIKey: true,
        models: [{ name: "Gemini 2.5 Flash" }],
      },
      { provider: "no-key", hasAPIKey: false, models: [{ name: "Hidden" }] },
      { provider: "custom", hasAPIKey: true, models: [{ name: "Model A" }] },
    );
    getConfigMock.mockResolvedValue({
      providers: {
        flare: { enabled: true },
        google: { enabled: false },
      },
      dynamicProviders: {
        custom: { enabled: true },
      },
    });
  });

  it("parses provider/model while preserving model ID slashes", () => {
    expect(parsePinnedAgentModel("flare/openai/gpt-oss-120b")).toEqual({
      provider: "flare",
      model: "openai/gpt-oss-120b",
    });
    expect(parsePinnedAgentModel("missing-separator")).toBeNull();
    expect(parsePinnedAgentModel("/model")).toBeNull();
  });

  it("exposes only authenticated-catalog models with an enabled provider and runtime key", async () => {
    const catalog = await getEnabledAgentModelCatalog();
    expect(catalog.map((option) => option.value)).toEqual([
      "flare/openai/gpt-oss-120b",
      "flare/disabled",
      "custom/Model A",
    ]);
    expect(catalog.some((option) => option.provider === "google")).toBe(false);
    expect(catalog.some((option) => option.provider === "no-key")).toBe(false);
  });

  it("leaves the requested model unchanged when no authorized agent is found or no pin exists", () => {
    const requested = { provider: "google", model: "Gemini 2.5 Flash" };
    const catalog = [
      { provider: "flare", model: "Model", value: "flare/Model" },
    ];
    expect(resolveAgentChatModel(requested, null, catalog)).toEqual(requested);
    expect(
      resolveAgentChatModel(requested, { instructions: {} }, catalog),
    ).toEqual(requested);
  });

  it("uses the authorized agent's pin instead of the request and automatic-route candidate", () => {
    const catalog = [
      {
        provider: "flare",
        model: "openai/gpt-oss-120b",
        value: "flare/openai/gpt-oss-120b",
      },
    ];
    expect(
      resolveAgentChatModel(
        { provider: "google", model: "Gemini 2.5 Flash" },
        { instructions: { model: "flare/openai/gpt-oss-120b" } },
        catalog,
      ),
    ).toEqual({ provider: "flare", model: "openai/gpt-oss-120b" });
  });

  it("fails clearly instead of falling back when a stored pin is stale or disabled", () => {
    expect(() =>
      resolveAgentChatModel(
        { provider: "google", model: "Gemini 2.5 Flash" },
        { instructions: { model: "google/Gemini 2.5 Flash" } },
        [],
      ),
    ).toThrow(AgentPinnedModelUnavailableError);
  });

  it("passes the effective pin to the team budget price gate", async () => {
    const loadPrice = vi.fn().mockResolvedValue({
      inputMicrosPerMillion: 1,
      outputMicrosPerMillion: 1,
      currency: "USD",
    });
    const effective = resolveAgentChatModel(
      { provider: "google", model: "Gemini 2.5 Flash" },
      { instructions: { model: "flare/openai/gpt-oss-120b" } },
      [
        {
          provider: "flare",
          model: "openai/gpt-oss-120b",
          value: "flare/openai/gpt-oss-120b",
        },
      ],
    );
    await resolveTeamMemberBudgetGate({
      enabled: true,
      teamId: "team-1",
      userId: "user-1",
      model: effective,
      loadPolicy: async () => ({
        memberId: "member-1",
        userId: "user-1",
        teamId: "team-1",
        role: "member",
        teamOwnerId: "owner-1",
        monthlyCapMicros: 1_000_000,
        currency: "USD",
        hardStop: true,
      }),
      loadPrice,
    });
    expect(loadPrice).toHaveBeenCalledWith("flare", "openai/gpt-oss-120b");
  });
});
