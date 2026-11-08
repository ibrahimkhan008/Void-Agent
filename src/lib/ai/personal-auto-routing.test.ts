import { describe, expect, it } from "vitest";
import {
  type PersonalAutomaticModel,
  createPersonalAutomaticCatalog,
  findPreviousPersonalChatModel,
  hasPersonalAutomaticCatalog,
  prioritizePreviousPersonalModel,
  rankPersonalAutomaticModels,
} from "./personal-auto-routing";

const candidate = (
  provider: string,
  model: string,
  overrides: Partial<PersonalAutomaticModel> = {},
): PersonalAutomaticModel => ({
  provider,
  model,
  toolCalling: true,
  vision: true,
  contextTokens: 128_000,
  displayMetadata: { automaticRoutingScores: { coding: 50 } },
  ...overrides,
});

describe("personal automatic model routing", () => {
  it("offers Auto only when a scored model has known or admin-verified context", () => {
    const unknownOnly = [
      {
        provider: "custom-gateway",
        hasAPIKey: true,
        models: [
          {
            name: "custom-model",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
            displayMetadata: { automaticRoutingScores: { coding: 80 } },
          },
        ],
      },
    ];
    expect(hasPersonalAutomaticCatalog(unknownOnly, () => undefined)).toBe(
      false,
    );

    const knownAdminContext = [
      {
        ...unknownOnly[0],
        models: [
          {
            ...unknownOnly[0].models[0],
            displayMetadata: {
              automaticRoutingScores: { coding: 80 },
              automaticRoutingContextTokens: 128_000,
            },
          },
        ],
      },
    ];
    expect(
      hasPersonalAutomaticCatalog(knownAdminContext, () => undefined),
    ).toBe(true);
    expect(hasPersonalAutomaticCatalog(unknownOnly, () => 128_000)).toBe(true);
  });

  it("builds candidates only from enabled, keyed, admin-scored providers", () => {
    const providers = [
      {
        provider: "openai",
        hasAPIKey: true,
        models: [
          {
            name: "gpt-main",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
          },
          {
            name: "unscored",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
          },
        ],
      },
      {
        provider: "disabled",
        hasAPIKey: true,
        models: [
          {
            name: "blocked",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
          },
        ],
      },
      {
        provider: "missing-key",
        hasAPIKey: false,
        models: [
          {
            name: "no-key",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
          },
        ],
      },
      {
        provider: "user-11111111-1111-4111-8111-111111111111",
        hasAPIKey: true,
        models: [
          {
            name: "private",
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
          },
        ],
      },
    ];
    const catalog = createPersonalAutomaticCatalog({
      providers,
      displayMetadata: {
        "OPENAI/GPT-MAIN": {
          automaticRoutingScores: { coding: 80 },
        },
        "openai/unscored": { developer: "OpenAI" },
        "disabled/blocked": {
          automaticRoutingScores: { coding: 100 },
        },
        "missing-key/no-key": {
          automaticRoutingScores: { coding: 100 },
        },
        "user-11111111-1111-4111-8111-111111111111/private": {
          automaticRoutingScores: { coding: 100 },
        },
      },
      isProviderEnabled: (provider) => provider !== "disabled",
      getContextTokens: (provider, model) =>
        provider === "openai" && model === "gpt-main" ? 128_000 : undefined,
    });

    expect(catalog).toEqual([
      {
        provider: "openai",
        model: "gpt-main",
        toolCalling: true,
        vision: true,
        contextTokens: 128_000,
        displayMetadata: { automaticRoutingScores: { coding: 80 } },
      },
    ]);
  });

  it("uses only explicit task scores and stable priority ordering", () => {
    const models = [
      candidate("openai", "unscored", {
        displayMetadata: { automaticRoutingScores: { reasoning: 90 } },
      }),
      candidate("anthropic", "lower-score", {
        displayMetadata: {
          automaticRoutingScores: { coding: 50 },
          automaticRoutingPriority: 1,
        },
      }),
      candidate("openai", "best-score", {
        displayMetadata: {
          automaticRoutingScores: { coding: 90 },
          automaticRoutingPriority: 50,
        },
      }),
      candidate("google", "tie-priority", {
        displayMetadata: {
          automaticRoutingScores: { coding: 90 },
          automaticRoutingPriority: 2,
        },
      }),
    ];

    expect(
      rankPersonalAutomaticModels({
        models,
        task: "coding",
        requiresTools: false,
        requiresVision: false,
        minimumContextTokens: 32_000,
      }).map(({ model }) => model),
    ).toEqual(["tie-priority", "best-score", "lower-score"]);
  });

  it("filters models missing required capabilities or known context", () => {
    const models = [
      candidate("openai", "text-only", { vision: false }),
      candidate("anthropic", "no-tools", { toolCalling: false }),
      candidate("google", "unknown-context", { contextTokens: undefined }),
      candidate("flare", "eligible"),
    ];

    expect(
      rankPersonalAutomaticModels({
        models,
        task: "coding",
        requiresTools: true,
        requiresVision: true,
        minimumContextTokens: 32_000,
      }).map(({ model }) => model),
    ).toEqual(["eligible"]);
  });

  it("returns no models if no administrator-scored candidate fits the task", () => {
    expect(
      rankPersonalAutomaticModels({
        models: [
          candidate("openai", "only-coding", {
            displayMetadata: { automaticRoutingScores: { coding: 80 } },
          }),
        ],
        task: "writing",
        requiresTools: false,
        requiresVision: false,
        minimumContextTokens: 32_000,
      }),
    ).toEqual([]);
  });

  it("finds the latest assistant's resolved model and prioritizes it only when eligible", () => {
    const previous = findPreviousPersonalChatModel([
      {
        role: "assistant",
        metadata: { chatModel: { provider: "openai", model: "old" } },
      },
      {
        role: "assistant",
        metadata: { chatModel: { provider: "auto", model: "auto" } },
      },
      {
        role: "assistant",
        metadata: { chatModel: { provider: "google", model: "gemini" } },
      },
    ]);
    const candidates = [
      { provider: "openai", model: "gpt" },
      { provider: "google", model: "gemini" },
    ];

    expect(previous).toEqual({ provider: "google", model: "gemini" });
    expect(prioritizePreviousPersonalModel(candidates, previous)).toEqual([
      candidates[1],
      candidates[0],
    ]);
    expect(
      prioritizePreviousPersonalModel(candidates, {
        provider: "retired",
        model: "gone",
      }),
    ).toEqual(candidates);
  });
});
