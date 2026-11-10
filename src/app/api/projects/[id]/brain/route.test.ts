import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  scheduleQueueTick: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/projects/brain-queue", () => ({
  scheduleProjectBrainQueueTick: mocks.scheduleQueueTick,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: vi.fn(async () => ({
      modelId: "test-model",
    })),
  },
}));

import { POST } from "./route";
import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: projectId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/projects/[id]/brain", () => {
  it("requires a signed-in project editor before reading source content", async () => {
    mocks.getSession.mockResolvedValue(null);
    const unauthenticated = await POST(
      new Request("http://localhost/api/projects/x/brain", { method: "POST" }),
      params,
    );
    expect(unauthenticated.status).toBe(401);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1" } });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    const viewer = await POST(
      new Request("http://localhost/api/projects/x/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionId }),
      }),
      params,
    );
    expect(viewer.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("validates source IDs before rate-limit or database work", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/x/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "not-a-uuid" }),
      }),
      params,
    );

    expect(response.status).toBe(400);
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("requires at least one attached collection", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [] },
      role: "editor",
    });
    const response = await POST(
      new Request("http://localhost/api/projects/x/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionId }),
      }),
      params,
    );

    expect(response.status).toBe(409);
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("stores an authorized source analysis as queued work and returns 202", async () => {
    const sourceQuery = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue([
          { itemId: collectionId, content: "The release is planned for June." },
        ]),
    };
    mocks.select.mockReturnValue(sourceQuery);
    const createdRun = {
      id: "00000000-0000-4000-8000-000000000003",
      status: "queued",
      attempts: 0,
    };
    const versionId = "00000000-0000-4000-8000-000000000004";
    const versionInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: versionId }]),
    };
    const activeSourceInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    };
    const runInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([createdRun]),
    };
    let insertCount = 0;
    let transactionCommitted = false;
    mocks.scheduleQueueTick.mockImplementation(async () => {
      expect(transactionCommitted).toBe(true);
    });
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback({
        insert: () => {
          const current = insertCount++;
          if (current === 0) return versionInsert;
          if (current === 1) return activeSourceInsert;
          return runInsert;
        },
      });
      transactionCommitted = true;
      return result;
    });

    const response = await POST(
      new Request("http://localhost/api/projects/x/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionId }),
      }),
      params,
    );

    expect(response.status).toBe(202);
    expect(mocks.scheduleQueueTick).toHaveBeenCalledWith(createdRun.id);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      runId: createdRun.id,
      status: "queued",
      reused: false,
    });
    expect(runInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedByUserId: "member-1",
        status: "queued",
        attempts: 0,
        sourceItemId: collectionId,
        sourceVersionId: versionId,
      }),
    );
    expect(versionInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sourceItemId: collectionId,
        contentLength: "The release is planned for June.".length,
      }),
    );
    expect(activeSourceInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sourceItemId: collectionId,
        sourceVersionId: versionId,
      }),
    );
  });

  it("requeues the same stale queued source run without creating a duplicate", async () => {
    const sourceQuery = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue([
          { itemId: collectionId, content: "Bounded source." },
        ]),
    };
    mocks.select.mockReturnValue(sourceQuery);

    const runId = "00000000-0000-4000-8000-000000000003";
    const versionId = "00000000-0000-4000-8000-000000000004";
    const versionInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: versionId }]),
    };
    const sourceStateInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    };
    const conflictingRunInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    const existingRun = {
      id: runId,
      projectId,
      sourceItemId: collectionId,
      status: "queued",
      attempts: 2,
      updatedAt: new Date("2026-11-08T05:50:00.000Z"),
      errorMessage: "Previous dispatch failed",
    };
    const lockedRunQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([existingRun]),
    };
    const updateReturning = vi
      .fn()
      .mockResolvedValue([
        { ...existingRun, status: "queued", errorMessage: null },
      ]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(versionInsert)
        .mockReturnValueOnce(sourceStateInsert)
        .mockReturnValueOnce(conflictingRunInsert),
      select: vi.fn().mockReturnValue(lockedRunQuery),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await POST(
      new Request("http://localhost/api/projects/x/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionId }),
      }),
      params,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      runId,
      status: "queued",
      reused: false,
    });
    expect(lockedRunQuery.for).toHaveBeenCalledWith("update");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        attempts: existingRun.attempts,
        errorMessage: null,
        updatedAt: expect.any(Date),
      }),
    );
    // The source fingerprint conflict is resolved to and updates the existing
    // run row under the transaction lock; the retry never inserts a second run.
    expect(conflictingRunInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sourceItemId: collectionId,
        sourceFingerprint: expect.any(String),
        status: "queued",
      }),
    );
    expect(conflictingRunInsert.onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.arrayContaining([expect.anything(), expect.anything()]),
    });
    expect(mocks.scheduleQueueTick).toHaveBeenCalledWith(runId);
    expect(tx.insert).toHaveBeenCalledTimes(3);
  });

  it.each(["queued", "running"] as const)(
    "leaves a fresh %s run alone when a retry races a live worker",
    async (status) => {
      const sourceQuery = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([
            { itemId: collectionId, content: "Current source." },
          ]),
      };
      mocks.select.mockReturnValue(sourceQuery);
      const versionInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "version-1" }]),
      };
      const sourceStateInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      };
      const conflictingRunInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      const freshRun = {
        id: "00000000-0000-4000-8000-000000000005",
        status,
        attempts: 1,
        updatedAt: new Date(),
      };
      const lockedRunQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([freshRun]),
      };
      const tx = {
        insert: vi
          .fn()
          .mockReturnValueOnce(versionInsert)
          .mockReturnValueOnce(sourceStateInsert)
          .mockReturnValueOnce(conflictingRunInsert),
        select: vi.fn().mockReturnValue(lockedRunQuery),
        update: vi.fn(),
      };
      mocks.transaction.mockImplementation(async (callback) => callback(tx));

      const response = await POST(
        new Request("http://localhost/api/projects/x/brain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: collectionId }),
        }),
        params,
      );

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({
        runId: freshRun.id,
        status,
        reused: true,
      });
      expect(lockedRunQuery.for).toHaveBeenCalledWith("update");
      expect(tx.update).not.toHaveBeenCalled();
      expect(mocks.scheduleQueueTick).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/projects/[id]/brain", () => {
  it("does not query or return source-derived data when no source remains visible", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [] },
      role: "editor",
    });
    const chatOwnerQuery = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mocks.select.mockReturnValue(chatOwnerQuery);

    const response = await GET(
      new Request(`http://localhost/api/projects/${projectId}/brain`),
      params,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      runs: [],
      facts: [],
      sources: [],
      chatSources: [],
      sourceVersions: [],
      todos: [],
      consolidatedTodos: [],
    });
    // Chat sources have a separate owner-validation query; document-backed
    // source reads are skipped when no collections remain visible.
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
