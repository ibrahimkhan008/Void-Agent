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

import {
  ScheduledJobIdempotencyConflictError,
  ScheduledJobReplayUnavailableError,
  schedulerRepository,
} from "./scheduler-repository.pg";

const makeUpdateChain = (rows: unknown[]) => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
};

const makeInsertChain = (rows: unknown[]) => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.values = vi.fn(() => chain);
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
};

const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.for = vi.fn().mockResolvedValue(rows);
  chain.then = vi.fn((resolve: (value: unknown[]) => unknown) =>
    Promise.resolve(rows).then(resolve),
  );
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

describe("schedulerRepository approved schedule idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    agentId: "00000000-0000-4000-8000-000000000001",
    name: "Daily review",
    cron: "0 9 * * 1-5",
    timezone: "UTC",
    payload: { triggerMessage: "Review the report" },
    nextRunAt: new Date("2026-11-09T09:00:00Z"),
    status: "active" as const,
  };
  const idempotency = { requestKey: "request-1", requestHash: "a".repeat(64) };

  it("creates the job and durable request reservation in one transaction", async () => {
    const reservation = {
      userId: "user-1",
      requestKey: "request-1",
      requestHash: idempotency.requestHash,
    };
    const job = { id: "job-1", userId: "user-1", name: "Daily review" };
    const reserveInsert = makeInsertChain([reservation]);
    const jobInsert = makeInsertChain([job]);
    const updateChain = makeUpdateChain([]);
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(reserveInsert)
        .mockReturnValueOnce(jobInsert),
      update: vi.fn(() => updateChain),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await schedulerRepository.createScheduledJob(
      input,
      "user-1",
      idempotency,
    );

    expect(result).toEqual(job);
    expect(dbMock.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(updateChain.set).toHaveBeenCalledWith({ scheduledJobId: "job-1" });
  });

  it("replays the existing job for the same key and hash", async () => {
    const replay = { id: "job-1", userId: "user-1" };
    const reservationInsert = makeInsertChain([]);
    const reservationSelect = makeSelectChain([
      {
        userId: "user-1",
        requestKey: "request-1",
        requestHash: idempotency.requestHash,
        scheduledJobId: "job-1",
      },
    ]);
    const jobSelect = makeSelectChain([replay]);
    const tx = {
      insert: vi.fn(() => reservationInsert),
      select: vi
        .fn()
        .mockReturnValueOnce(reservationSelect)
        .mockReturnValueOnce(jobSelect),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    expect(
      await schedulerRepository.createScheduledJob(
        input,
        "user-1",
        idempotency,
      ),
    ).toEqual(replay);
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledTimes(2);
  });

  it("rejects key reuse for different approved schedule data", async () => {
    const reservationInsert = makeInsertChain([]);
    const reservationSelect = makeSelectChain([
      {
        userId: "user-1",
        requestKey: "request-1",
        requestHash: "b".repeat(64),
        scheduledJobId: "job-1",
      },
    ]);
    const tx = {
      insert: vi.fn(() => reservationInsert),
      select: vi.fn(() => reservationSelect),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      schedulerRepository.createScheduledJob(input, "user-1", idempotency),
    ).rejects.toBeInstanceOf(ScheduledJobIdempotencyConflictError);
    expect(tx.select).toHaveBeenCalledOnce();
  });

  it("does not recreate a schedule after its approved request tombstone remains", async () => {
    const reservationInsert = makeInsertChain([]);
    const reservationSelect = makeSelectChain([
      {
        userId: "user-1",
        requestKey: "request-1",
        requestHash: idempotency.requestHash,
        scheduledJobId: null,
      },
    ]);
    const tx = {
      insert: vi.fn(() => reservationInsert),
      select: vi.fn(() => reservationSelect),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      schedulerRepository.createScheduledJob(input, "user-1", idempotency),
    ).rejects.toBeInstanceOf(ScheduledJobReplayUnavailableError);
    expect(tx.insert).toHaveBeenCalledOnce();
  });
});
