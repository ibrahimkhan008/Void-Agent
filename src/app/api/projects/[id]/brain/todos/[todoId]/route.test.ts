import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  notifyAcceptedProjectBrainTodo: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/notifications/project-brain-todo-accepted", () => ({
  notifyAcceptedProjectBrainTodo: mocks.notifyAcceptedProjectBrainTodo,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, update: mocks.update },
}));

import { PATCH } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const todoId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId, todoId }) };
const makeRequest = (status: string) =>
  new Request(
    `http://localhost/api/projects/${projectId}/brain/todos/${todoId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ status }),
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { collectionIds: [collectionId] },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.notifyAcceptedProjectBrainTodo.mockResolvedValue({ inserted: 1 });
  const selectQuery = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return selectQuery;
    }),
    limit: vi.fn().mockResolvedValue([{ id: todoId }]),
  };
  mocks.select.mockReturnValue(selectQuery);
  let updatedStatus = "accepted";
  const updateQuery = {
    set: vi.fn((values: { status: string }) => {
      updatedStatus = values.status;
      return updateQuery;
    }),
    where: vi.fn((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return updateQuery;
    }),
    returning: vi.fn(async () => [{ id: todoId, status: updatedStatus }]),
  };
  mocks.update.mockReturnValue(updateQuery);
});

describe("PATCH project brain todo review", () => {
  it("requires editor access and hides tasks from sources no longer visible", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PATCH(makeRequest("accepted"), params)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getProjectAccess.mockResolvedValue(null);
    expect((await PATCH(makeRequest("accepted"), params)).status).toBe(404);
    mocks.getProjectAccess.mockResolvedValue({
      project: { collectionIds: [] },
      role: "editor",
    });
    expect((await PATCH(makeRequest("accepted"), params)).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects missing or cross-origin requests before reading task data", async () => {
    const missingOrigin = new Request(
      `http://localhost/api/projects/${projectId}/brain/todos/${todoId}`,
      { method: "PATCH", body: JSON.stringify({ status: "accepted" }) },
    );
    expect((await PATCH(missingOrigin, params)).status).toBe(403);
    expect(
      (
        await PATCH(
          new Request(
            `http://localhost/api/projects/${projectId}/brain/todos/${todoId}`,
            {
              method: "PATCH",
              headers: {
                Origin: "https://attacker.invalid",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: "accepted" }),
            },
          ),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows reviewers to accept/reject proposals and complete accepted tasks", async () => {
    const accepted = await PATCH(makeRequest("accepted"), params);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    expect(mocks.update.mock.results.at(-1)?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    );
    await PATCH(makeRequest("rejected"), params);
    expect(mocks.update.mock.results.at(-1)?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
    );
    await PATCH(makeRequest("completed"), params);
    expect(mocks.update.mock.results.at(-1)?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    const updatePredicate = new PgDialect().sqlToQuery(
      mocks.predicates.at(-1) as never,
    );
    expect(updatePredicate.sql).toContain('"project_brain_source_state"');
    expect(mocks.notifyAcceptedProjectBrainTodo).toHaveBeenCalledOnce();
    expect(mocks.notifyAcceptedProjectBrainTodo).toHaveBeenCalledWith({
      projectId,
      todoId,
    });
  });

  it("rejects unsupported transitions and rate-limits reviews", async () => {
    expect((await PATCH(makeRequest("proposed"), params)).status).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await PATCH(makeRequest("accepted"), params)).status).toBe(429);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
