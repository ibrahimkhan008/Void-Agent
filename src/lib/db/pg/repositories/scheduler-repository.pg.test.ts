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
  ScheduledJobManualRunRequestTable,
  ScheduledJobTable,
  ScheduledRunTable,
} from "../schema.pg";
import {
  ManualScheduledRunConflictError,
  ManualScheduledRunIdempotencyConflictError,
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

describe("schedulerRepository manual run requests", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeChain = (rows: unknown[]) => {
    const chain: Record<string, any> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.for = vi.fn().mockResolvedValue(rows);
    chain.set = vi.fn((values) => {
      chain.valuesSet = values;
      return chain;
    });
    chain.values = vi.fn((values) => {
      chain.valuesSet = values;
      return chain;
    });
    chain.onConflictDoNothing = vi.fn(() => chain);
    chain.returning = vi.fn().mockResolvedValue(rows);
    chain.then = vi.fn((resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
    );
    return chain;
  };

  it("replays a matching idempotency key without adding another request", async () => {
    const job = { id: "job-1", userId: "user-1", status: "active" };
    const existing = {
      id: "request-1",
      requestHash: "job-1",
      scheduledJobId: "job-1",
      status: "completed",
    };
    const selects = [makeChain([job]), makeChain([existing])];
    const tx = {
      select: vi.fn(() => selects.shift()),
      insert: vi.fn(),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      schedulerRepository.requestManualScheduledRun(
        "job-1",
        "user-1",
        "same-key",
      ),
    ).resolves.toEqual({
      id: "request-1",
      status: "completed",
      created: false,
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects key reuse for another job and concurrent pending work", async () => {
    const job = { id: "job-1", userId: "user-1", status: "active" };
    const mismatched = makeChain([job]);
    const existingOtherJob = makeChain([
      { id: "request-1", requestHash: "job-2", scheduledJobId: "job-2" },
    ]);
    const txWithExistingKey = {
      select: vi
        .fn()
        .mockReturnValueOnce(mismatched)
        .mockReturnValueOnce(existingOtherJob),
      insert: vi.fn(),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) =>
      callback(txWithExistingKey),
    );
    await expect(
      schedulerRepository.requestManualScheduledRun(
        "job-1",
        "user-1",
        "reused-key",
      ),
    ).rejects.toBeInstanceOf(ManualScheduledRunIdempotencyConflictError);

    const selects = [
      makeChain([job]),
      makeChain([]),
      makeChain([{ id: "pending-request" }]),
    ];
    const txWithPending = {
      select: vi.fn(() => selects.shift()),
      insert: vi.fn(),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) =>
      callback(txWithPending),
    );
    await expect(
      schedulerRepository.requestManualScheduledRun(
        "job-1",
        "user-1",
        "new-key",
      ),
    ).rejects.toBeInstanceOf(ManualScheduledRunConflictError);
    expect(txWithPending.insert).not.toHaveBeenCalled();
  });

  it("binds a run row before execution and stores it on the request", async () => {
    const now = new Date("2026-11-07T10:00:00.000Z");
    const job = { id: "job-1", userId: "user-1", status: "paused" };
    const request = {
      id: "request-1",
      status: "processing",
      attempts: 1,
      scheduledRunId: "run-1",
    };
    const select = makeChain([
      { request: { id: "request-1", status: "pending", attempts: 0 }, job },
    ]);
    const jobUpdate = makeChain([{ ...job, claimToken: "claim-1" }]);
    const requestUpdate = makeChain([request]);
    const runInsert = makeChain([{ id: "run-1", scheduledJobId: "job-1" }]);
    const tx = {
      select: vi.fn(() => select),
      update: vi
        .fn()
        .mockReturnValueOnce(jobUpdate)
        .mockReturnValueOnce(requestUpdate),
      insert: vi.fn(() => runInsert),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await schedulerRepository.claimManualScheduledRuns(
      now,
      10,
      "claim-1",
      new Date(now.getTime() + 60_000),
    );

    expect(result).toEqual([
      {
        job: { ...job, claimToken: "claim-1" },
        requestId: "request-1",
        runId: "run-1",
      },
    ]);
    expect(select.for).toHaveBeenCalledWith("update", { skipLocked: true });
    expect(runInsert.valuesSet).toEqual({ scheduledJobId: "job-1" });
    expect(requestUpdate.valuesSet).toEqual(
      expect.objectContaining({
        status: "processing",
        scheduledRunId: "run-1",
      }),
    );
    expect(tx.update.mock.calls.map(([table]) => table)).toEqual([
      ScheduledJobTable,
      ScheduledJobManualRunRequestTable,
    ]);
  });

  it("does not replay a started request after its worker lease expires", async () => {
    const now = new Date("2026-11-07T10:00:00.000Z");
    const candidate = {
      request: {
        id: "request-1",
        status: "processing",
        attempts: 1,
        scheduledRunId: "run-1",
      },
      job: { id: "job-1", userId: "user-1", status: "active" },
    };
    const select = makeChain([candidate]);
    const requestUpdate = makeChain([]);
    const runUpdate = makeChain([]);
    const tx = {
      select: vi.fn(() => select),
      update: vi
        .fn()
        .mockReturnValueOnce(requestUpdate)
        .mockReturnValueOnce(runUpdate),
      insert: vi.fn(),
    };
    dbMock.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await schedulerRepository.claimManualScheduledRuns(
      now,
      10,
      "claim-2",
      new Date(now.getTime() + 60_000),
    );

    expect(result).toEqual([]);
    expect(runUpdate.valuesSet).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("not replayed"),
      }),
    );
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update.mock.calls.map(([table]) => table)).toEqual([
      ScheduledJobManualRunRequestTable,
      ScheduledRunTable,
    ]);
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
