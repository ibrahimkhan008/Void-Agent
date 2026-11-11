import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

vi.mock("lib/db/pg/repositories/site-config-repository.pg", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
}));

import { DEFAULT_BUG_BOUNTY_PROGRAM, getBugBountyProgram } from "./bug-bounty";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBugBountyProgram", () => {
  it("returns the defaults when nothing is configured", async () => {
    mocks.getConfig.mockResolvedValue(null);
    const program = await getBugBountyProgram();
    expect(program).toEqual(DEFAULT_BUG_BOUNTY_PROGRAM);
    expect(mocks.getConfig).toHaveBeenCalledWith("bug-bounty");
  });

  it("merges stored settings over the defaults", async () => {
    mocks.getConfig.mockResolvedValue({
      heroTitle: "Custom bounty",
      contactEmail: "bugs@example.com",
    });
    const program = await getBugBountyProgram();
    expect(program.heroTitle).toBe("Custom bounty");
    expect(program.contactEmail).toBe("bugs@example.com");
    // Untouched fields keep the published defaults.
    expect(program.rewardTiers).toEqual(DEFAULT_BUG_BOUNTY_PROGRAM.rewardTiers);
    expect(program.inScope).toEqual(DEFAULT_BUG_BOUNTY_PROGRAM.inScope);
  });

  it("falls back to the default reward tiers when the stored list is empty", async () => {
    mocks.getConfig.mockResolvedValue({
      rewardTiers: [],
      heroTitle: "Custom bounty",
    });
    const program = await getBugBountyProgram();
    expect(program.rewardTiers).toEqual(DEFAULT_BUG_BOUNTY_PROGRAM.rewardTiers);
    expect(program.heroTitle).toBe("Custom bounty");
  });

  it("keeps non-empty stored reward tiers", async () => {
    const tiers = [
      {
        severity: "high" as const,
        label: "High",
        amountCents: 42,
        currency: "USD",
        description: "Test tier",
      },
    ];
    mocks.getConfig.mockResolvedValue({ rewardTiers: tiers });
    const program = await getBugBountyProgram();
    expect(program.rewardTiers).toEqual(tiers);
  });

  it("still serves the defaults when the config store is unreachable", async () => {
    mocks.getConfig.mockRejectedValue(new Error("no database"));
    const program = await getBugBountyProgram();
    expect(program).toEqual(DEFAULT_BUG_BOUNTY_PROGRAM);
  });

  it("exposes the published severity tiers in ascending payout order", () => {
    const amounts = DEFAULT_BUG_BOUNTY_PROGRAM.rewardTiers.map(
      (tier) => tier.amountCents,
    );
    expect(amounts).toEqual([5_000, 25_000, 100_000, 300_000]);
    expect(
      DEFAULT_BUG_BOUNTY_PROGRAM.rewardTiers.map((t) => t.severity),
    ).toEqual(["low", "medium", "high", "critical"]);
  });
});
