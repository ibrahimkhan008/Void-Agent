import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionOwnerIds: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  updatePredicates: [] as unknown[],
  selectPredicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionOwnerIds: mocks.getProjectCollectionOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { update: mocks.update, select: mocks.select },
}));

import { PATCH } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const factId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const teamId = "00000000-0000-4000-8000-000000000004";
const params = { params: Promise.resolve({ id: projectId, factId }) };
const fact = { id: factId, projectId, reviewStatus: "accepted" };

function makeRequest(origin = "http://localhost") {
  return new Request(
    `http://localhost/api/projects/${projectId}/brain/facts/${factId}`,
    {
      method: "PATCH",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    },
  );
}

function queryBuilder(
  predicates: unknown[],
  rows: unknown[],
  terminal: "returning" | "limit",
) {
  const builder: Record<string, unknown> = {};
  builder.set = vi.fn(() => builder);
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn((predicate: unknown) => {
    predicates.push(predicate);
    return builder;
  });
  builder.returning = vi.fn(async () => (terminal === "returning" ? rows : []));
  builder.limit = vi.fn(async () => (terminal === "limit" ? rows : []));
  builder.then = (
    resolve: (value: unknown[]) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

function sqlFor(predicate: unknown) {
  return new PgDialect().sqlToQuery(predicate as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updatePredicates.length = 0;
  mocks.selectPredicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "team-editor" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, teamId, collectionIds: [collectionId] },
    role: "editor",
  });
  mocks.getProjectCollectionOwnerIds.mockResolvedValue(["team-owner"]);
  mocks.update.mockImplementation(() =>
    queryBuilder(mocks.updatePredicates, [fact], "returning"),
  );
  mocks.select.mockImplementation(() =>
    queryBuilder(mocks.selectPredicates, [], "limit"),
  );
});

describe("PATCH project brain fact review", () => {
  it("allows an active fact whose source is attached to the same team", async () => {
    const response = await PATCH(makeRequest(), params);

    expect(response.status).toBe(200);
    expect(mocks.getProjectCollectionOwnerIds).toHaveBeenCalledOnce();
    const query = sqlFor(mocks.updatePredicates[0]);
    expect(query.sql).toContain('"collection_item"."collection_id"');
    expect(query.sql).toContain('"collection"."org_id"');
    expect(query.sql).toContain('"collection_item"."status"');
    expect(query.sql).toContain('"project_brain_source_state"');
    expect(query.params).toContain(collectionId);
    expect(query.params).toContain(teamId);
  });

  it("rejects detached and foreign-team source facts without updating them", async () => {
    mocks.update.mockImplementation(() =>
      queryBuilder(mocks.updatePredicates, [], "returning"),
    );
    mocks.select.mockImplementation(() =>
      queryBuilder(mocks.selectPredicates, [], "limit"),
    );

    const response = await PATCH(makeRequest(), params);

    expect(response.status).toBe(404);
    const updateQuery = sqlFor(mocks.updatePredicates[0]);
    const fallbackQuery = sqlFor(mocks.selectPredicates[0]);
    for (const query of [updateQuery, fallbackQuery]) {
      expect(query.sql).toContain('"collection_item"."collection_id"');
      expect(query.sql).toContain('"collection"."org_id"');
      expect(query.sql).toContain('"project_brain_source_state"');
      expect(query.params).toContain(collectionId);
      expect(query.params).toContain(teamId);
    }
  });

  it("keeps editor, active-revision, and same-origin protections", async () => {
    expect(
      (await PATCH(makeRequest("https://attacker.invalid"), params)).status,
    ).toBe(403);
    const missingOrigin = new Request(
      `http://localhost/api/projects/${projectId}/brain/facts/${factId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      },
    );
    expect((await PATCH(missingOrigin, params)).status).toBe(403);

    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, teamId, collectionIds: [collectionId] },
      role: "viewer",
    });
    expect((await PATCH(makeRequest(), params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns conflict for an already reviewed fact only when its source is still in scope", async () => {
    mocks.update.mockImplementation(() =>
      queryBuilder(mocks.updatePredicates, [], "returning"),
    );
    mocks.select.mockImplementation(() =>
      queryBuilder(mocks.selectPredicates, [{ id: factId }], "limit"),
    );

    const response = await PATCH(makeRequest(), params);

    expect(response.status).toBe(409);
    const query = sqlFor(mocks.selectPredicates[0]);
    expect(query.sql).toContain('"collection"."org_id"');
    expect(query.sql).toContain('"project_brain_source_state"');
    expect(query.params).toContain(teamId);
  });
});
