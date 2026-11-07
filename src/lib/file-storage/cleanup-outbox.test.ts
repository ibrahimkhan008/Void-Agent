import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  update: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
  txSelect: vi.fn(),
  txUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  lte: (...args: unknown[]) => args,
  sql: () => ({}),
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { transaction: mocks.transaction, update: mocks.update },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  FileCleanupOutboxTable: {
    id: {},
    userId: {},
    storageKey: {},
    status: {},
    attempts: {},
    nextAttemptAt: {},
    lastError: {},
    createdAt: {},
    updatedAt: {},
  },
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { exists: mocks.exists, delete: mocks.delete },
}));

import { processFileCleanupOutbox } from "./cleanup-outbox";

const task = {
  id: "task-1",
  userId: "user-1",
  storageKey: "uploads/user-1/file.pdf",
  attempts: 0,
  status: "pending",
  nextAttemptAt: new Date(0),
  lastError: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("file cleanup outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const txChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([task]),
      set: vi.fn().mockReturnThis(),
    };
    mocks.txSelect.mockReturnValue(txChain);
    mocks.txUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ select: mocks.txSelect, update: mocks.txUpdate }),
    );
    mocks.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    mocks.exists.mockResolvedValue(true);
    mocks.delete.mockResolvedValue(undefined);
  });

  it("commits a lease before deleting, then records completion", async () => {
    const events: string[] = [];
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback({
        select: mocks.txSelect,
        update: mocks.txUpdate,
      });
      events.push("lease-committed");
      return result;
    });
    mocks.delete.mockImplementation(async () => {
      events.push("object-deleted");
    });
    const result = await processFileCleanupOutbox("task-1");
    expect(result).toMatchObject({ completed: 1, failed: 0 });
    expect(events).toEqual(["lease-committed", "object-deleted"]);
    expect(mocks.update).toHaveBeenCalled();
  });

  it("persists a visible retry on storage failure", async () => {
    mocks.delete.mockRejectedValue(new Error("provider unavailable"));
    const result = await processFileCleanupOutbox("task-1");
    expect(result).toMatchObject({ completed: 0, failed: 1 });
    expect(result.errors[0]).toContain("provider unavailable");
    const sets = mocks.update.mock.results.map(
      (entry) => entry.value.set.mock.calls[0][0],
    );
    expect(
      sets.some(
        (value) =>
          value.status === "pending" &&
          value.lastError === "provider unavailable",
      ),
    ).toBe(true);
  });

  it("does not call storage when another worker already claimed the row", async () => {
    const txChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
    };
    mocks.txSelect.mockReturnValue(txChain);
    const result = await processFileCleanupOutbox("task-1");
    expect(result).toEqual({ completed: 0, failed: 0, errors: [] });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("rejects an object key outside the recorded owner's prefix", async () => {
    mocks.txSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi
        .fn()
        .mockResolvedValue([
          { ...task, storageKey: "uploads/user-2/private.pdf" },
        ]),
    });
    const result = await processFileCleanupOutbox("task-1");
    expect(result.failed).toBe(1);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
