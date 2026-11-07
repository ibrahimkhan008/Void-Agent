import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
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
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, update: mocks.update },
}));

import { PATCH } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId, eventId }) };
const request = (status: string) =>
  new Request(
    `http://localhost/api/projects/${projectId}/brain/timeline/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );
const rawRequest = (body: string) =>
  new Request(
    `http://localhost/api/projects/${projectId}/brain/timeline/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body,
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
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return query;
    }),
    limit: vi.fn().mockResolvedValue([{ id: eventId }]),
  };
  mocks.select.mockReturnValue(query);
  const updateQuery = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return updateQuery;
    }),
    returning: vi.fn().mockResolvedValue([{ id: eventId, status: "accepted" }]),
  };
  mocks.update.mockReturnValue(updateQuery);
});

describe("PATCH project brain timeline event review", () => {
  it("requires same-origin editor access and rate limit before touching event rows", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PATCH(request("accepted"), params)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    const noOrigin = new Request(
      `http://localhost/api/projects/${projectId}/brain/timeline/${eventId}`,
      { method: "PATCH", body: JSON.stringify({ status: "accepted" }) },
    );
    expect((await PATCH(noOrigin, params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { collectionIds: [collectionId] },
      role: "viewer",
    });
    expect((await PATCH(request("accepted"), params)).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("reviews only visible current-source proposals and uses an atomic proposed-state transition", async () => {
    const response = await PATCH(request("accepted"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        reviewedAt: expect.any(Date),
      }),
    );
    const updateSql = new PgDialect().sqlToQuery(
      mocks.predicates.at(-1) as never,
    );
    expect(updateSql.sql).toContain('"project_brain_event"."status"');
    expect(updateSql.sql).toContain('"project_brain_source_state"');
    expect(updateSql.sql).toContain("exists");
    const visibilitySql = new PgDialect().sqlToQuery(
      mocks.predicates[1] as never,
    );
    expect(visibilitySql.sql).toContain('"collection_item"."collection_id"');
    expect(visibilitySql.sql).toContain('"collection"."user_id"');
    expect(visibilitySql.sql).toContain('"collection_item"."status"');
  });

  it("rejects malformed or oversized bodies and invalid states before event lookup", async () => {
    expect((await PATCH(rawRequest("{"), params)).status).toBe(400);
    expect((await PATCH(rawRequest("x".repeat(4_097)), params)).status).toBe(
      413,
    );
    expect((await PATCH(request("completed"), params)).status).toBe(400);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await PATCH(request("accepted"), params)).status).toBe(429);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
