import { describe, expect, it } from "vitest";
import {
  formatContextTokenCount,
  getContextUsagePercent,
  getContextUsageTokens,
  getModelContextWindow,
  selectLatestCompletedContextUsage,
} from "./model-context-windows";

describe("model context windows", () => {
  it("looks up a known provider/model pair without guessing unknown models", () => {
    expect(
      getModelContextWindow({ provider: "OPENAI", model: "GPT 5.5" }),
    ).toBe(400_000);
    expect(
      getModelContextWindow({ provider: "custom", model: "unknown" }),
    ).toBeUndefined();
    expect(getModelContextWindow(undefined)).toBeUndefined();
  });

  it("uses actual usage totals and omits empty or invalid usage", () => {
    expect(getContextUsageTokens({ inputTokens: 120, outputTokens: 30 })).toBe(
      150,
    );
    expect(getContextUsageTokens({ totalTokens: 80 })).toBe(80);
    expect(
      getContextUsageTokens({ inputTokens: 0, outputTokens: 0 }),
    ).toBeUndefined();
    expect(getContextUsageTokens({ inputTokens: Number.NaN })).toBeUndefined();
  });

  it("selects only the latest completed assistant usage and never falls back to stale usage", () => {
    const old = {
      role: "assistant",
      metadata: {
        runStatus: "completed",
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
        chatModel: { provider: "openai", model: "GPT 5.5" },
      },
    } as const;
    expect(selectLatestCompletedContextUsage([old, { role: "user" }])).toEqual({
      usage: old.metadata.usage,
      model: old.metadata.chatModel,
    });
    expect(
      selectLatestCompletedContextUsage([
        old,
        { role: "assistant", metadata: { runStatus: "incomplete" } },
      ]),
    ).toBeUndefined();
  });

  it("bounds the meter percentage and formats token counts", () => {
    expect(getContextUsagePercent(150, 100)).toBe(100);
    expect(getContextUsagePercent(-10, 100)).toBe(0);
    expect(formatContextTokenCount(12_500)).toBe("12.5K");
    expect(formatContextTokenCount(1_500_000)).toBe("1.5M");
  });
});
