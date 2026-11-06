import { describe, expect, it } from "vitest";
import {
  AUTO_CHECK_INTERVAL_MS,
  FOCUS_CHECK_MIN_GAP_MS,
  isForcedUpdateCheck,
  shouldRunUpdateCheck,
} from "./update-policy.js";

describe("desktop update policy", () => {
  it("runs its first automatic check and throttles focus events", () => {
    expect(
      shouldRunUpdateCheck({ lastCheckAt: null, now: 1_000, minGapMs: 300 }),
    ).toBe(true);
    expect(
      shouldRunUpdateCheck({ lastCheckAt: 900, now: 1_000, minGapMs: 300 }),
    ).toBe(false);
    expect(
      shouldRunUpdateCheck({ lastCheckAt: 700, now: 1_000, minGapMs: 300 }),
    ).toBe(true);
  });

  it("keeps interval checks above the focus throttle and lets explicit checks bypass it", () => {
    expect(AUTO_CHECK_INTERVAL_MS).toBeGreaterThan(FOCUS_CHECK_MIN_GAP_MS);
    expect(isForcedUpdateCheck("manual")).toBe(true);
    expect(isForcedUpdateCheck("renderer")).toBe(true);
    expect(isForcedUpdateCheck("focus")).toBe(false);
  });
});
