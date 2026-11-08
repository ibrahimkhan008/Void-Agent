import { describe, expect, it } from "vitest";
import {
  findModelDisplayMetadata,
  validateModelDisplayMetadataMap,
} from "./model-display-metadata";

describe("model display metadata", () => {
  it("validates and resolves provider/model keys case-insensitively", () => {
    const metadata = validateModelDisplayMetadataMap({
      "Flare/DeepSeek/V3.2": {
        developer: "DeepSeek",
        country: "cn",
        speed: true,
        inputPriceUsd: 0.3,
        outputPriceUsd: 0.9,
      },
    });

    expect(metadata).not.toBeNull();
    expect(
      findModelDisplayMetadata(metadata!, "flare", "deepseek/v3.2"),
    ).toMatchObject({
      developer: "DeepSeek",
      country: "CN",
      speed: true,
      inputPriceUsd: 0.3,
      outputPriceUsd: 0.9,
    });
  });

  it("rejects malformed keys, duplicate normalized identities and invalid USD data", () => {
    expect(
      validateModelDisplayMetadataMap({ model: { developer: "Example" } }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/model": { speed: true },
        "OpenAI/Model": { thinking: true },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/model": { country: "USA" },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/model": { inputPriceUsd: Number.POSITIVE_INFINITY },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/model": { inputPriceUsd: -1 },
      }),
    ).toBeNull();
  });

  it("keeps display catalog USD pricing separate from EUR enforcement data", () => {
    const metadata = validateModelDisplayMetadataMap({
      "openai/model": { inputPriceUsd: 2.5, outputPriceUsd: 7.5 },
    });
    expect(metadata?.["openai/model"]).toEqual({
      inputPriceUsd: 2.5,
      outputPriceUsd: 7.5,
    });
    expect(metadata?.["openai/model"]).not.toHaveProperty(
      "inputMicrosPerMillion",
    );
  });

  it("accepts only explicit bounded automatic-routing scores", () => {
    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingPriority: 10,
          automaticRoutingContextTokens: 128_000,
          automaticRoutingScores: { coding: 90, reasoning: 20 },
        },
      })?.["openai/gpt-current"],
    ).toMatchObject({
      automaticRoutingPriority: 10,
      automaticRoutingContextTokens: 128_000,
      automaticRoutingScores: { coding: 90, reasoning: 20 },
    });

    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingScores: { coding: 101 },
        },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingScores: { coding: 0 },
        },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingScores: { unknown: 100 },
        },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingContextTokens: 0,
        },
      }),
    ).toBeNull();
    expect(
      validateModelDisplayMetadataMap({
        "openai/gpt-current": {
          automaticRoutingContextTokens: 2_000_001,
        },
      }),
    ).toBeNull();
  });
});
