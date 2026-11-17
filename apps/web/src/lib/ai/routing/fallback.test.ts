import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getConfig, validateManualModel } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  validateManualModel: vi.fn(),
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig },
}));
vi.mock("./service", () => ({ validateManualModel }));

import {
  findGatewayFallbackCandidate,
  getSuccessfulGatewayModelSlug,
  groupGatewayStepUsage,
  resolveGatewayFallbackCandidates,
} from "./fallback";
import type { RoutingCandidate } from "./types";

function candidate(
  provider: string,
  model: string,
  inputPrice: number,
  outputPrice: number,
  overrides: Partial<RoutingCandidate> = {},
): RoutingCandidate {
  return {
    deploymentId: `${provider}-${model}`,
    modelId: `${provider}/${model}`,
    chatModel: { provider, model },
    providerModelId: `${provider}/${model}`,
    region: "us",
    dataRetention: "zero",
    inputPriceMicrosPerMillion: inputPrice,
    outputPriceMicrosPerMillion: outputPrice,
    contextTokens: 32_000,
    supportsTools: true,
    supportsVision: true,
    active: true,
    profiles: [],
    ...overrides,
  };
}

describe("Gateway fallback chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfig.mockResolvedValue({
      providers: {
        openai: {
          fallbackChain: [
            { provider: "google", model: "flash" },
            { provider: "anthropic", model: "sonnet" },
          ],
        },
      },
      globalFallback: [{ provider: "google", model: "flash" }],
    });
  });

  it("passes only policy-validated, capability-compatible, non-more-expensive fallbacks", async () => {
    const safe = candidate("google", "flash", 4, 8);
    const expensive = candidate("anthropic", "sonnet", 5, 8);
    const noTools = candidate("google", "no-tools", 2, 3, {
      supportsTools: false,
    });
    validateManualModel.mockImplementation(async ({ chatModel }) => {
      if (chatModel.model === "blocked") throw new Error("policy denied");
      const found = [safe, expensive, noTools].find(
        (item) =>
          item.chatModel.provider === chatModel.provider &&
          item.chatModel.model === chatModel.model,
      );
      return found ? { chatModel, candidate: found } : { chatModel };
    });
    getConfig.mockResolvedValue({
      providers: {
        openai: {
          fallbackChain: [
            { provider: "google", model: "flash" },
            { provider: "anthropic", model: "sonnet" },
            { provider: "google", model: "no-tools" },
            { provider: "google", model: "blocked" },
          ],
        },
      },
    });

    const result = await resolveGatewayFallbackCandidates({
      organizationId: "org-1",
      userId: "user-1",
      primary: { provider: "openai", model: "primary" },
      primaryCandidate: candidate("openai", "primary", 4, 8),
      requiresTools: true,
      requiresVision: false,
    });

    expect(result).toEqual([safe]);
    expect(validateManualModel).toHaveBeenCalledTimes(4);
  });

  it("requires a successful provider attempt and matches only prevalidated candidates", () => {
    const metadata = {
      gateway: {
        routing: {
          modelAttempts: [
            {
              canonicalSlug: "openai/primary",
              providerAttempts: [{ provider: "openai", success: false }],
            },
            {
              canonicalSlug: "google/flash",
              providerAttempts: [{ provider: "google", success: true }],
            },
          ],
        },
      },
    };

    expect(getSuccessfulGatewayModelSlug(metadata)).toBe("google/flash");
    expect(
      findGatewayFallbackCandidate({
        providerMetadata: metadata,
        candidates: [candidate("google", "flash", 4, 8)],
      })?.deploymentId,
    ).toBe("google-flash");
    expect(
      findGatewayFallbackCandidate({
        providerMetadata: metadata,
        candidates: [],
      }),
    ).toBeUndefined();
    expect(
      getSuccessfulGatewayModelSlug({
        gateway: {
          routing: { modelAttempts: [{ canonicalSlug: "google/flash" }] },
        },
      }),
    ).toBeNull();
  });

  it("attributes each tool-loop step to its successful model", () => {
    const primary = candidate("openai", "primary", 4, 8);
    const fallback = candidate("google", "flash", 2, 4);
    const groups = groupGatewayStepUsage({
      candidates: [primary, fallback],
      defaultCandidate: primary,
      steps: [
        {
          providerMetadata: {
            gateway: {
              routing: {
                modelAttempts: [
                  {
                    canonicalSlug: "google/flash",
                    providerAttempts: [{ success: true }],
                  },
                ],
              },
            },
          },
          usage: { inputTokens: 100, outputTokens: 25 },
        },
        {
          providerMetadata: {
            gateway: {
              routing: {
                modelAttempts: [
                  {
                    canonicalSlug: "openai/primary",
                    providerAttempts: [{ success: true }],
                  },
                ],
              },
            },
          },
          usage: { inputTokens: 50, outputTokens: 10 },
        },
      ],
    });

    expect(groups).toEqual([
      {
        candidate: fallback,
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        noCacheTokens: 0,
      },
      {
        candidate: primary,
        inputTokens: 50,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        noCacheTokens: 0,
      },
    ]);
  });
});
