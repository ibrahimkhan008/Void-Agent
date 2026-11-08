import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  txInsert: vi.fn(),
  membershipValues: vi.fn(),
  membershipConflict: vi.fn(),
  membershipReturning: vi.fn(),
  policyValues: vi.fn(),
}));

vi.mock("../db.pg", () => ({
  pgDb: { transaction: mocks.transaction },
}));
vi.mock("server-only", () => ({}));

import { teamRepository } from "./team-repository.pg";

describe("teamRepository.createTeamMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ insert: mocks.txInsert }),
    );
    mocks.txInsert
      .mockReturnValueOnce({
        values: mocks.membershipValues.mockReturnValue({
          onConflictDoNothing: mocks.membershipConflict.mockReturnValue({
            returning: mocks.membershipReturning,
          }),
        }),
      })
      .mockReturnValueOnce({ values: mocks.policyValues });
  });

  it("creates the member and its default budget policy in one transaction", async () => {
    const member = {
      id: "membership-1",
      teamId: "team-1",
      userId: "user-2",
      role: "viewer",
    };
    mocks.membershipReturning.mockResolvedValueOnce([member]);
    mocks.policyValues.mockResolvedValueOnce(undefined);

    await expect(
      teamRepository.createTeamMember("team-1", "user-2", "viewer"),
    ).resolves.toEqual(member);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.membershipValues).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "user-2",
      role: "viewer",
    });
    expect(mocks.membershipConflict).toHaveBeenCalledOnce();
    expect(mocks.policyValues).toHaveBeenCalledWith({
      memberId: "membership-1",
      monthlyCapMicros: 15_000_000,
      currency: "EUR",
      hardStop: true,
    });
  });

  it("returns null on a duplicate membership and creates no policy", async () => {
    mocks.membershipReturning.mockResolvedValueOnce([]);
    await expect(
      teamRepository.createTeamMember("team-1", "user-2", "member"),
    ).resolves.toBeNull();
    expect(mocks.policyValues).not.toHaveBeenCalled();
  });
});
