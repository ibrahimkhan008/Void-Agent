import { describe, expect, it } from "vitest";
import {
  ModelPricingMapSchema,
  calculateCostMicros,
  estimateCostMicros,
  findModelPrice,
} from "./model-pricing";

describe("admin model pricing", () => {
  it("requires explicit trusted prices and finds model keys case-insensitively", () => {
    const pricing = ModelPricingMapSchema.parse({
      "provider/model-x": {
        inputMicrosPerMillion: 2_000_000,
        outputMicrosPerMillion: 8_000_000,
        currency: "EUR",
      },
    });

    expect(findModelPrice(pricing, "Provider", "Model-X")).toEqual({
      inputMicrosPerMillion: 2_000_000,
      outputMicrosPerMillion: 8_000_000,
      currency: "EUR",
    });
    expect(findModelPrice(pricing, "provider", "unconfigured")).toBeUndefined();
    expect(ModelPricingMapSchema.parse({})).toEqual({});
  });

  it("rejects missing/invalid rates and ambiguous case-folded keys", () => {
    expect(() =>
      ModelPricingMapSchema.parse({
        "provider/model": { inputMicrosPerMillion: 1 },
      }),
    ).toThrow();
    expect(() =>
      ModelPricingMapSchema.parse({
        "provider/model": {
          inputMicrosPerMillion: -1,
          outputMicrosPerMillion: 1,
          currency: "EUR",
        },
      }),
    ).toThrow();
    expect(() =>
      ModelPricingMapSchema.parse({
        "provider/model": {
          inputMicrosPerMillion: 1,
          outputMicrosPerMillion: 2,
          currency: "EUR",
        },
        "PROVIDER/MODEL": {
          inputMicrosPerMillion: 1,
          outputMicrosPerMillion: 2,
          currency: "EUR",
        },
      }),
    ).toThrow();
  });

  it("calculates actual and conservative estimated cost in micros", () => {
    const price = {
      inputMicrosPerMillion: 1_000_000,
      outputMicrosPerMillion: 2_000_000,
      currency: "EUR",
    };
    expect(
      calculateCostMicros(
        { inputTokens: 100_000, outputTokens: 50_000 },
        price,
      ),
    ).toBe(200_000);
    expect(estimateCostMicros(400, price)).toBe(8_292);
    expect(estimateCostMicros(400, price, 10_240)).toBe(20_580);
    expect(() =>
      calculateCostMicros({ inputTokens: -1, outputTokens: 1 }, price),
    ).toThrow();
  });
});
