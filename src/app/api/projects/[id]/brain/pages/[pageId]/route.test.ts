import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
  rows: [] as unknown[][],
  predicates: [] as unknown[],
  limits: [] as number[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const pageId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const sourceOwnerId = "00000000-0000-4000-8000-000000000004";
const params = { params: Promise.resolve({ id: projectId, pageId }) };
const revisionDate = new Date("2026-11-07T09:00:00.000Z");

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: (size: number) => {
      mocks.limits.push(size);
      return Promise.resolve(rows);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.limits.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "viewer-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([sourceOwnerId]);
  mocks.rows = [
    [
      {
        id: pageId,
        title: "Northstar",
        entityType: "project",
        normalizedTitle: "northstar",
        salience: 1.25,
        updatedAt: revisionDate,
      },
    ],
    [
      {
        id: "fact-1",
        subjectPageId: pageId,
        objectPageId: null,
        subject: "Northstar",
        predicate: "also known as",
        object: "North Star",
        evidence: "The plan calls it North Star.",
        confidence: 0.9,
        reviewStatus: "accepted",
        sourceItemId: "source-1",
        sourceVersionId: "revision-1",
        sourceVersionCreatedAt: revisionDate,
        sourceSnapshotAvailable: true,
        filename: "plan.md",
        sourceUrl: null,
      },
      {
        id: "fact-2",
        subjectPageId: pageId,
        objectPageId: "00000000-0000-4000-8000-000000000010",
        subject: "Northstar",
        predicate: "owner",
        object: "Riya",
        evidence: "Riya leads the project.",
        confidence: 0.7,
        reviewStatus: "proposed",
        sourceItemId: "source-1",
        sourceVersionId: "revision-1",
        sourceVersionCreatedAt: revisionDate,
        sourceSnapshotAvailable: true,
        filename: "plan.md",
        sourceUrl: null,
      },
      {
        id: "fact-3",
        subjectPageId: "00000000-0000-4000-8000-000000000011",
        objectPageId: pageId,
        subject: "Atlas",
        predicate: "depends on",
        object: "Northstar",
        evidence: "Atlas depends on Northstar.",
        confidence: 0.8,
        reviewStatus: "accepted",
        sourceItemId: "source-1",
        sourceVersionId: "revision-1",
        sourceVersionCreatedAt: revisionDate,
        sourceSnapshotAvailable: true,
        filename: "plan.md",
        sourceUrl: null,
      },
      {
        id: "fact-4",
        subjectPageId: pageId,
        objectPageId: "00000000-0000-4000-8000-000000000010",
        subject: "Northstar",
        predicate: "owner",
        object: "Riya",
        evidence: "Riya leads the project.",
        confidence: 0.7,
        reviewStatus: "accepted",
        sourceItemId: "source-1",
        sourceVersionId: "revision-1",
        sourceVersionCreatedAt: revisionDate,
        sourceSnapshotAvailable: true,
        filename: "plan.md",
        sourceUrl: null,
      },
    ],
    [{ title: "North Star", mergedAt: revisionDate }],
  ];
  mocks.select.mockImplementation(() => query(mocks.rows.shift() ?? []));
});

describe("GET project brain page detail", () => {
  it("requires authentication and valid project/page IDs before querying", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      401,
    );

    const invalid = await GET(new Request("https://void.test"), {
      params: Promise.resolve({ id: projectId, pageId: "not-a-uuid" }),
    });
    expect(invalid.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns typed page facts and exact source revision provenance", async () => {
    const response = await GET(new Request("https://void.test"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.detail.page).toMatchObject({
      id: pageId,
      title: "Northstar",
      entityType: "project",
      salience: 1.25,
    });
    expect(body.detail.aliases).toEqual(["North Star"]);
    expect(body.detail.mergedFrom).toEqual([
      { title: "North Star", mergedAt: revisionDate.toISOString() },
    ]);
    expect(body.detail.links).toEqual([
      {
        pageId: "00000000-0000-4000-8000-000000000010",
        title: "Riya",
        type: "owner",
        confidence: 0.7,
      },
    ]);
    expect(body.detail.backlinks).toEqual([
      {
        pageId: "00000000-0000-4000-8000-000000000011",
        title: "Atlas",
        type: "depends on",
        confidence: 0.8,
      },
    ]);
    expect(
      body.detail.facts.map(
        (fact: { reviewStatus: string }) => fact.reviewStatus,
      ),
    ).toEqual(["accepted", "proposed", "accepted", "accepted"]);
    expect(body.detail.facts[0]).toMatchObject({
      sourceVersionId: "revision-1",
      sourceVersionCreatedAt: revisionDate.toISOString(),
      sourceSnapshotAvailable: true,
      filename: "plan.md",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.predicates).toHaveLength(3);
    const compiled = mocks.predicates.map((predicate) =>
      new PgDialect().sqlToQuery(predicate as SQL),
    );
    const gates = compiled.map((predicate) => predicate.sql).join(" ");
    expect(gates).toContain("project_brain_source_state");
    expect(gates).toContain("collection_item");
    expect(gates).toContain("collection");
    expect(compiled.flatMap((predicate) => predicate.params)).toContain(
      "accepted",
    );
    expect(compiled[2]?.sql).toContain("project_brain_page_merge");
    expect(compiled[2]?.sql).toContain("project_brain_source_state");
    expect(compiled[2]?.sql).toContain("collection_item");
    expect(compiled[2]?.sql).toContain("collection");
    expect(compiled[2]?.params).toContain(projectId);
    expect(compiled[2]?.params).toContain(pageId);
    expect(mocks.limits).toEqual([1, 100, 50]);
  });

  it("omits merge titles when no current visible identity source remains", async () => {
    mocks.rows[2] = [];
    const response = await GET(new Request("https://void.test"), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.detail.mergedFrom).toEqual([]);
    const mergePredicate = new PgDialect().sqlToQuery(
      mocks.predicates[2] as SQL,
    );
    expect(mergePredicate.sql).toContain("project_brain_source_state");
    expect(mergePredicate.sql).toContain("collection_item");
    expect(mergePredicate.sql).toContain("collection");
    expect(mergePredicate.params).toContain(projectId);
    expect(mergePredicate.params).toContain(pageId);
  });

  it("does not return identity pages without a current visible accepted identity claim", async () => {
    mocks.rows = [[], [{ id: "should-not-query" }]];
    const response = await GET(new Request("https://void.test"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ detail: null });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("hides pages when the project or current source scope is unavailable", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );

    mocks.getProjectCollectionSourceOwnerIds.mockResolvedValueOnce([]);
    const noSource = await GET(new Request("https://void.test"), params);
    expect(await noSource.json()).toEqual({ detail: null });
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
