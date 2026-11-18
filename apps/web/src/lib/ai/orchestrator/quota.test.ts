import { describe, expect, it } from "vitest";
import {
  ORCHESTRATOR_DAILY_RUN_LIMITS,
  orchestratorDailyRunLimit,
  utcDayStart,
} from "./quota";

describe("orchestrator daily quotas", () => {
  it("maps all subscription tiers to the documented limits", () => {
    expect(ORCHESTRATOR_DAILY_RUN_LIMITS).toEqual({
      free: 2,
      "voidagent-pro": 15,
      "voidagent-max": 50,
      "voidagent-enterprises": 200,
      "voidagent-enterprises-pro": 200,
      "voidagent-enterprises-max": 200,
    });
    expect(orchestratorDailyRunLimit("unknown-tier")).toBe(2);
  });

  it("resets at midnight UTC", () => {
    expect(
      utcDayStart(new Date("2026-11-18T15:45:12.123Z")).toISOString(),
    ).toBe("2026-11-18T00:00:00.000Z");
  });
});
