import { describe, expect, it } from "vitest";
import {
  formatEuroRateMicros,
  hasDuplicatePricingModelKey,
  isValidPricingModelKey,
  parseEuroRateMicros,
} from "./team-budget-pricing-form";

describe("team budget pricing form", () => {
  it("parses EUR rates exactly to micros and formats them back", () => {
    expect(parseEuroRateMicros("0.25")).toBe(250_000);
    expect(parseEuroRateMicros("12.000001")).toBe(12_000_001);
    expect(parseEuroRateMicros("0")).toBe(0);
    expect(formatEuroRateMicros(250_000)).toBe("0.25");
    expect(formatEuroRateMicros(12_000_000)).toBe("12");
  });

  it.each(["", "-1", "1e3", "1.0000001", "1,25", "1000001"])(
    "rejects invalid or out-of-range rates: %s",
    (value) => expect(parseEuroRateMicros(value)).toBeUndefined(),
  );

  it("requires provider/model keys and detects case-insensitive duplicates", () => {
    expect(isValidPricingModelKey("openai/gpt-4o")).toBe(true);
    expect(isValidPricingModelKey("openai/")).toBe(false);
    expect(isValidPricingModelKey("/gpt-4o")).toBe(false);
    expect(
      hasDuplicatePricingModelKey("OpenAI/GPT-4o", ["openai/gpt-4o"]),
    ).toBe(true);
  });
});
