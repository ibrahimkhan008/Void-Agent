import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBugBountyProgram: vi.fn(),
  leaderboard: vi.fn(),
  stats: vi.fn(),
}));

vi.mock("lib/bug-bounty", () => ({
  getBugBountyProgram: mocks.getBugBountyProgram,
}));
vi.mock("lib/db/repository", () => ({
  bugReportRepository: {
    leaderboard: mocks.leaderboard,
    stats: mocks.stats,
  },
}));

import { GET } from "./route";

describe("/api/bug-bounty/program", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBugBountyProgram.mockResolvedValue({
      enabled: true,
      heroTitle: "Bug Bounty Program",
      heroSubtitle: "Help us keep the product safe.",
      introMarkdown: "",
      inScope: ["Web app"],
      outOfScope: ["DoS"],
      rewardTiers: [
        {
          severity: "critical",
          label: "Critical",
          amountCents: 300_000,
          currency: "USD",
          description: "RCE.",
        },
      ],
      rulesMarkdown: "",
      disclosurePolicyMarkdown: "",
      contactEmail: "security@example.com",
    });
    mocks.leaderboard.mockResolvedValue([
      {
        userId: "u1",
        userName: "Ada",
        userEmail: "ada@example.com",
        userImage: null,
        acceptedCount: 3,
        awardedCount: 1,
        totalAwardedCents: 25_000,
        currency: "USD",
      },
    ]);
    mocks.stats.mockResolvedValue({
      totalReports: 12,
      acceptedReports: 5,
      awardedReports: 2,
      totalAwardedCents: 125_000,
    });
  });

  it("serves the public program payload without a session", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.program.heroTitle).toBe("Bug Bounty Program");
    expect(body.leaderboard).toHaveLength(1);
    expect(body.stats).toEqual({
      totalReports: 12,
      acceptedReports: 5,
      awardedReports: 2,
      totalAwardedCents: 125_000,
    });
    // Leaderboard is capped at the published top 10.
    expect(mocks.leaderboard).toHaveBeenCalledWith(10);
  });

  it("returns a generic 500 when any aggregate fails", async () => {
    mocks.stats.mockRejectedValue(new Error("pool exhausted"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
  });
});
