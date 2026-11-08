import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  getActiveProjectBrainChatSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  preflightWhere: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txWhere: vi.fn(),
  update: vi.fn(),
  updateWhere: vi.fn(),
  returning: vi.fn(),
  visibleRows: [] as Array<Record<string, string>>,
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/projects/project-chat-brain-source", () => ({
  getActiveProjectBrainChatSourceOwnerIds:
    mocks.getActiveProjectBrainChatSourceOwnerIds,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));

import { PATCH } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const todoIds = [
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];
const taskRows = [
  {
    id: todoIds[0],
    title: "Review release notes",
    details: "Check dates and links",
    sourceItemId: "00000000-0000-4000-8000-000000000010",
  },
  {
    id: todoIds[1],
    title: "REVIEW: release notes!",
    details: "Check dates and links",
    sourceItemId: "00000000-0000-4000-8000-000000000011",
  },
];
const request = (
  origin = "http://localhost",
  ids = todoIds,
  status: "accepted" | "completed" = "completed",
) =>
  new Request(
    `http://localhost/api/projects/${projectId}/brain/todos/consolidated`,
    {
      method: "PATCH",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ todoIds: ids, status }),
    },
  );
const params = { params: Promise.resolve({ id: projectId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.visibleRows = taskRows;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { collectionIds: [collectionId] },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.getActiveProjectBrainChatSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  const selectBuilder = (resultRows?: unknown[]) => {
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: (predicate: unknown) => {
        mocks.preflightWhere(predicate);
        return builder;
      },
      getSQL: () => sql`SELECT 1`,
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(resultRows ?? []).then(resolve, reject),
    };
    return builder;
  };
  mocks.select.mockImplementation(() => selectBuilder(mocks.visibleRows));
  const subquery = {
    from: () => subquery,
    innerJoin: () => subquery,
    where: (predicate: unknown) => {
      mocks.txWhere(predicate);
      return subquery;
    },
    getSQL: () => sql`SELECT 1`,
  };
  mocks.txSelect.mockImplementation(() => subquery);
  const updateQuery = {
    set: vi.fn().mockReturnThis(),
    where: (predicate: unknown) => {
      mocks.updateWhere(predicate);
      return updateQuery;
    },
    returning: vi.fn().mockResolvedValue(todoIds.map((id) => ({ id }))),
  };
  mocks.returning.mockReturnValue(updateQuery);
  mocks.update.mockReturnValue(updateQuery);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      select: mocks.txSelect,
      update: mocks.update,
    }),
  );
});

describe("PATCH consolidated project-brain tasks", () => {
  it("completes an exact-match group atomically with current visibility guards", async () => {
    const response = await PATCH(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completedTodoIds: todoIds });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    const predicate = new PgDialect().sqlToQuery(
      mocks.updateWhere.mock.calls[0]?.[0] as never,
    );
    expect(predicate.sql).toContain('"project_brain_source_state"');
    expect(predicate.sql).toContain("EXISTS");
    expect(predicate.params).toContain("accepted");
  });

  it("reopens completed exact-match groups under the same source and revision guards", async () => {
    const response = await PATCH(
      request("http://localhost", todoIds, "accepted"),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reopenedTodoIds: todoIds });
    expect(mocks.update.mock.results.at(-1)?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    );
    const predicates = mocks.updateWhere.mock.calls.map((call) =>
      new PgDialect().sqlToQuery(call[0] as never),
    );
    expect(predicates.at(-1)?.sql).toContain('"project_brain_source_state"');
    expect(predicates.at(-1)?.sql).toContain('"project_brain_todo"."status"');
    expect(predicates.at(-1)?.params).toContain("completed");
    expect(predicates.at(-1)?.sql).toContain('"project_brain_chat_source"');
  });

  it("rejects missing and cross-origin Origin before database access", async () => {
    const absent = new Request(
      `http://localhost/api/projects/${projectId}/brain/todos/consolidated`,
      { method: "PATCH", body: JSON.stringify({ todoIds }) },
    );
    expect((await PATCH(absent, params)).status).toBe(403);
    expect(
      (await PATCH(request("https://attacker.invalid"), params)).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("bounds request bodies before parsing or querying source tasks", async () => {
    const oversized = new Request(
      `http://localhost/api/projects/${projectId}/brain/todos/consolidated`,
      {
        method: "PATCH",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ todoIds, padding: "x".repeat(9_000) }),
      },
    );
    expect((await PATCH(oversized, params)).status).toBe(413);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not merge different task identities or hidden/stale source rows", async () => {
    mocks.visibleRows = [
      taskRows[0]!,
      { ...taskRows[1]!, title: "Ship release" },
    ];
    expect((await PATCH(request(), params)).status).toBe(409);
    mocks.visibleRows = [taskRows[0]!];
    expect((await PATCH(request(), params)).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rolls back rather than partially completing a concurrently changed group", async () => {
    const updateQuery = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: todoIds[0] }]),
    };
    mocks.update.mockReturnValue(updateQuery);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ select: mocks.txSelect, update: mocks.update }),
    );
    const response = await PATCH(request(), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("changed"),
    });
  });

  it("rejects a stale concurrent reopen without partially changing the group", async () => {
    const updateQuery = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: todoIds[0] }]),
    };
    mocks.update.mockReturnValue(updateQuery);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ select: mocks.txSelect, update: mocks.update }),
    );
    const response = await PATCH(
      request("http://localhost", todoIds, "accepted"),
      params,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("changed"),
    });
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    );
  });
});
