import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * DB-free per the repo convention: `pgDb` is mocked so the query *shape* is
 * what gets asserted. These tests pin the clauses that make the app builder
 * safe: owner + thread ownership predicates, active-status gating, the
 * per-user admission advisory lock, and the settled-status resume gate.
 */
const h = vi.hoisted(() => {
  // One shared object: the mock closures and the test both mutate the SAME
  // instance (spreading would copy the array references and desynchronize).
  const h = {
    rowsQueue: [] as any[][],
    updateReturning: [] as any[],
    insertReturning: [] as any[],
    deleteReturning: [] as any[],
    capturedWhere: [] as any[],
    capturedSet: [] as any[],
    capturedInserts: [] as any[],
    capturedExec: [] as any[],
    db: undefined as any,
  };

  function recordingChain(result: () => any[]) {
    const chain: any = {
      from: () => chain,
      where: (predicate: unknown) => {
        h.capturedWhere.push(predicate);
        return chain;
      },
      orderBy: () => chain,
      limit: () => Promise.resolve(result()),
      returning: (_mapper?: unknown) => Promise.resolve(result()),
      then: (
        resolve: (value: any[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  }

  const db: any = {
    select: () => recordingChain(() => h.rowsQueue.shift() ?? []),
    update: () => ({
      set: (values: unknown) => {
        h.capturedSet.push(values);
        return recordingChain(() => h.updateReturning);
      },
    }),
    insert: () => ({
      values: (values: unknown) => {
        h.capturedInserts.push(values);
        return {
          returning: () => Promise.resolve(h.insertReturning),
        };
      },
    }),
    delete: () => recordingChain(() => h.deleteReturning),
    execute: (query: unknown) => {
      h.capturedExec.push(query);
      return Promise.resolve({});
    },
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  };
  h.db = db;

  return h;
});

function boundValues(predicate: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      found.push(node);
      return;
    }
    if (typeof node === "object") {
      if (seen.has(node)) return;
      seen.add(node);
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value);
      }
    }
  };

  walk(predicate);
  return found;
}

vi.mock("../db.pg", () => ({ pgDb: h.db }));

const { pgAppBuildRepository } = await import("./app-build-repository.pg");

const USER = "user_1";
const OTHER = "user_2";
const THREAD = "11111111-1111-1111-1111-111111111111";
const BUILD = "22222222-2222-4222-8222-222222222222";
const ACTIVE_STATUSES = ["queued", "generating", "provisioning"];

beforeEach(() => {
  h.rowsQueue = [];
  h.updateReturning = [];
  h.insertReturning = [];
  h.deleteReturning = [];
  h.capturedWhere = [];
  h.capturedSet = [];
  h.capturedInserts = [];
  h.capturedExec = [];
});

describe("createIfCapacity admission", () => {
  test("creates a queued build under the per-user advisory lock", async () => {
    const build = { id: BUILD, status: "queued" };
    h.rowsQueue = [[{ id: THREAD }], [{ count: 0 }]];
    h.insertReturning = [build];

    const result = await pgAppBuildRepository.createIfCapacity({
      id: BUILD,
      userId: USER,
      threadId: THREAD,
      prompt: "a small timer",
      activeLimit: 2,
    });

    expect(result).toEqual({ status: "created", build });
    // Admission is serialized per user so concurrent POSTs cannot both pass
    // the active-build count.
    expect(h.capturedExec).toHaveLength(1);
    expect(boundValues(h.capturedExec[0])).toContain(USER);
    // The thread must be owned by the caller, not just exist.
    expect(boundValues(h.capturedWhere[0])).toContain(THREAD);
    expect(boundValues(h.capturedWhere[0])).toContain(USER);
    // The active-build gate counts only unsettled builds.
    for (const status of ACTIVE_STATUSES) {
      expect(boundValues(h.capturedWhere[1])).toContain(status);
    }
    expect(h.capturedInserts[0]).toMatchObject({
      id: BUILD,
      userId: USER,
      threadId: THREAD,
      prompt: "a small timer",
      status: "queued",
    });
  });

  test("returns thread_not_found when the thread is not the caller's", async () => {
    h.rowsQueue = [[], []];

    const result = await pgAppBuildRepository.createIfCapacity({
      id: BUILD,
      userId: USER,
      threadId: THREAD,
      prompt: "p",
      activeLimit: 2,
    });

    expect(result).toEqual({ status: "thread_not_found" });
    expect(h.capturedInserts).toHaveLength(0);
  });

  test("rejects a second concurrent build once the active cap is reached", async () => {
    h.rowsQueue = [[{ id: THREAD }], [{ count: 2 }]];

    const result = await pgAppBuildRepository.createIfCapacity({
      id: BUILD,
      userId: USER,
      threadId: THREAD,
      prompt: "p",
      activeLimit: 2,
    });

    expect(result).toEqual({ status: "active_limit" });
    expect(h.capturedInserts).toHaveLength(0);
  });
});

describe("owner-scoped reads", () => {
  test("getForOwner filters by both id and user", async () => {
    const row = { id: BUILD, userId: USER };
    h.rowsQueue = [[row]];

    await expect(
      pgAppBuildRepository.getForOwner(BUILD, USER),
    ).resolves.toEqual(row);
    const predicate = boundValues(h.capturedWhere[0]);
    expect(predicate).toContain(BUILD);
    expect(predicate).toContain(USER);

    h.rowsQueue = [[]];
    await expect(pgAppBuildRepository.getForOwner(BUILD, OTHER)).resolves.toBe(
      null,
    );
  });

  test("listForOwner is scoped to the caller", async () => {
    h.rowsQueue = [[{ id: BUILD }]];
    await expect(pgAppBuildRepository.listForOwner(USER)).resolves.toEqual([
      { id: BUILD },
    ]);
    expect(boundValues(h.capturedWhere[0])).toContain(USER);
  });
});

describe("status-gated updates", () => {
  test("updateActiveForOwner only touches unsettled builds and returns null otherwise", async () => {
    h.updateReturning = [{ id: BUILD, status: "generating" }];
    await expect(
      pgAppBuildRepository.updateActiveForOwner(BUILD, USER, {
        status: "provisioning",
      }),
    ).resolves.toMatchObject({ id: BUILD });
    for (const status of ACTIVE_STATUSES) {
      expect(boundValues(h.capturedWhere[0])).toContain(status);
    }
    expect(h.capturedSet[0]).toMatchObject({ status: "provisioning" });
    expect(h.capturedSet[0].updatedAt).toBeDefined();

    h.updateReturning = [];
    await expect(
      pgAppBuildRepository.updateActiveForOwner(BUILD, USER, {
        status: "ready",
      }),
    ).resolves.toBe(null);
  });

  test("cancelForOwner writes a terminal cancelled state on active builds only", async () => {
    h.updateReturning = [{ id: BUILD, status: "cancelled" }];
    await expect(
      pgAppBuildRepository.cancelForOwner(BUILD, USER),
    ).resolves.toMatchObject({ id: BUILD });
    expect(h.capturedSet[0]).toMatchObject({
      status: "cancelled",
      error: "Build cancelled",
    });
    for (const status of ACTIVE_STATUSES) {
      expect(boundValues(h.capturedWhere[0])).toContain(status);
    }

    h.updateReturning = [];
    await expect(
      pgAppBuildRepository.cancelForOwner(BUILD, USER),
    ).resolves.toBe(null);
  });

  test("beginResumeForOwner only revives settled builds with capacity", async () => {
    h.rowsQueue = [[{ count: 0 }]];
    h.updateReturning = [
      { id: BUILD, status: "provisioning", previewUrl: null },
    ];
    const resumed = await pgAppBuildRepository.beginResumeForOwner(
      BUILD,
      USER,
      2,
    );
    expect(resumed).toMatchObject({ id: BUILD });
    // Resume resets the preview and clears stale errors.
    expect(h.capturedSet[0]).toMatchObject({
      status: "provisioning",
      previewUrl: null,
      error: null,
    });
    // Only ready/failed builds can be resumed — cancelled is terminal.
    // capturedWhere[0] is the admission count; [1] is the update predicate.
    // (boundValues also picks up the column's enum metadata, so only the
    // positive membership of "ready"/"failed" is asserted here.)
    const predicate = boundValues(h.capturedWhere[1]);
    expect(predicate).toContain(BUILD);
    expect(predicate).toContain(USER);
    expect(predicate).toContain("ready");
    expect(predicate).toContain("failed");

    h.rowsQueue = [[{ count: 2 }]];
    h.updateReturning = [];
    h.capturedSet = [];
    await expect(
      pgAppBuildRepository.beginResumeForOwner(BUILD, USER, 2),
    ).resolves.toBe(null);
    // No update issued when the active-build cap blocks the resume.
    expect(h.capturedSet).toHaveLength(0);
  });

  test("deleteForOwner reports whether the caller's row was removed", async () => {
    h.deleteReturning = [{ id: BUILD }];
    await expect(
      pgAppBuildRepository.deleteForOwner(BUILD, USER),
    ).resolves.toBe(true);
    const predicate = boundValues(h.capturedWhere[0]);
    expect(predicate).toContain(BUILD);
    expect(predicate).toContain(USER);

    h.deleteReturning = [];
    await expect(
      pgAppBuildRepository.deleteForOwner(BUILD, OTHER),
    ).resolves.toBe(false);
  });
});
