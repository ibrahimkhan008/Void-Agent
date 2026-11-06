import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: dbMock }));

import { schedulerRepository } from "./scheduler-repository.pg";

const makeUpdateChain = (rows: unknown[]) => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
};

describe("schedulerRepository claim leases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects due rows with FOR UPDATE SKIP LOCKED before assigning a lease", async () => {
    const due = [{ id: "job-a" }, { id: "job-b" }];
    const claimed = due.map((job) => ({ ...job, claimToken: "token" }));
    const selectChain: Record<string, ReturnType<typeof vi.fn>> = {};
    selectChain.from = vi.fn(() => selectChain);
    selectChain.where = vi.fn(() => selectChain);
    selectChain.orderBy = vi.fn(() => selectChain);
    selectChain.limit = vi.fn(() => selectChain);
    selectChain.for = vi.fn().mockResolvedValue(due);
    const updateChain = makeUpdateChain(claimed);
    const tx = {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    const leaseUntil = new Date("2026-11-06T20:00:00.000Z");
    const result = await schedulerRepository.claimDueScheduledJobs(
      new Date("2026-11-06T19:57:00.000Z"),
      10,
      "token",
      leaseUntil,
    );

    expect(result).toEqual(claimed);
    expect(dbMock.transaction).toHaveBeenCalledOnce();
    expect(selectChain.for).toHaveBeenCalledWith("update", {
      skipLocked: true,
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "token",
        claimExpiresAt: leaseUntil,
      }),
    );
    expect(updateChain.where).toHaveBeenCalledOnce();
  });

  it("does not finalize a job when the claim token is stale", async () => {
    const updateChain = makeUpdateChain([]);
    dbMock.update.mockReturnValue(updateChain);

    const result = await schedulerRepository.completeScheduledJobClaim(
      "job-a",
      "user-a",
      "stale-token",
      { nextRunAt: new Date("2026-11-07T09:00:00.000Z") },
    );

    expect(result).toBeNull();
    expect(updateChain.where).toHaveBeenCalledOnce();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: null, claimExpiresAt: null }),
    );
  });

  it("invalidates an active lease when an owner pauses or reschedules a job", async () => {
    const updateChain = makeUpdateChain([{ id: "job-a" }]);
    dbMock.update.mockReturnValue(updateChain);

    await schedulerRepository.updateScheduledJob("job-a", "user-a", {
      status: "paused",
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
        claimToken: null,
        claimExpiresAt: null,
      }),
    );
  });
});
