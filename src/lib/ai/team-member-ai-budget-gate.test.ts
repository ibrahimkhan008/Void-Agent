import { describe, expect, it, vi } from "vitest";
import {
  TeamBudgetCurrencyMismatchError,
  TeamBudgetModelUnpricedError,
  isValidTeamMemberBudgetRolloutValue,
  resolveTeamMemberBudgetGate,
} from "./team-member-ai-budget-gate";

const policy = {
  memberId: "member-1",
  userId: "user-1",
  teamId: "team-1",
  role: "member",
  teamOwnerId: "owner-1",
  monthlyCapMicros: 15_000_000,
  currency: "EUR",
  hardStop: true,
};

const model = { provider: "provider", model: "model" };
const price = {
  inputMicrosPerMillion: 1_000_000,
  outputMicrosPerMillion: 2_000_000,
  currency: "EUR",
};

describe("team-member budget rollout gate", () => {
  it("accepts only an explicit boolean rollout setting", () => {
    expect(isValidTeamMemberBudgetRolloutValue(undefined)).toBe(true);
    expect(isValidTeamMemberBudgetRolloutValue(true)).toBe(true);
    expect(isValidTeamMemberBudgetRolloutValue(false)).toBe(true);
    expect(isValidTeamMemberBudgetRolloutValue("true")).toBe(false);
    expect(isValidTeamMemberBudgetRolloutValue(1)).toBe(false);
  });

  it("defaults off and skips membership/pricing lookups when absent or false", async () => {
    const loadPolicy = vi.fn(async () => policy);
    const loadPrice = vi.fn(async () => price);

    for (const enabled of [undefined, false, "true"]) {
      await expect(
        resolveTeamMemberBudgetGate({
          enabled,
          teamId: "team-1",
          userId: "user-1",
          model,
          loadPolicy,
          loadPrice,
        }),
      ).resolves.toBeUndefined();
    }

    expect(loadPolicy).not.toHaveBeenCalled();
    expect(loadPrice).not.toHaveBeenCalled();
  });

  it("keeps enabled budgets fail-closed for capped members with missing prices", async () => {
    const loadPolicy = vi.fn(async () => policy);
    const loadPrice = vi.fn(async () => undefined);

    await expect(
      resolveTeamMemberBudgetGate({
        enabled: true,
        teamId: "team-1",
        userId: "user-1",
        model,
        loadPolicy,
        loadPrice,
      }),
    ).rejects.toThrow(TeamBudgetModelUnpricedError);
    expect(loadPolicy).toHaveBeenCalledOnce();
    expect(loadPrice).toHaveBeenCalledOnce();
  });

  it("does not require pricing for an uncapped owner and rejects currency mismatches", async () => {
    const loadPolicy = vi.fn(async () => null);
    const loadPrice = vi.fn(async () => price);
    await expect(
      resolveTeamMemberBudgetGate({
        enabled: true,
        teamId: "team-1",
        userId: "owner-1",
        model,
        loadPolicy,
        loadPrice,
      }),
    ).resolves.toBeUndefined();
    expect(loadPrice).not.toHaveBeenCalled();

    await expect(
      resolveTeamMemberBudgetGate({
        enabled: true,
        teamId: "team-1",
        userId: "user-1",
        model,
        loadPolicy: async () => policy,
        loadPrice: async () => ({ ...price, currency: "USD" }),
      }),
    ).rejects.toThrow(TeamBudgetCurrencyMismatchError);
  });

  it("returns the trusted team and model price only after opt-in and policy checks", async () => {
    await expect(
      resolveTeamMemberBudgetGate({
        enabled: true,
        teamId: "team-1",
        userId: "user-1",
        model,
        loadPolicy: async () => policy,
        loadPrice: async () => price,
      }),
    ).resolves.toEqual({ teamId: "team-1", price });
  });
});
