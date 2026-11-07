import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
  query: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { createProjectKnowledgeGraphTool } from "./project-knowledge";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";

const createTool = () =>
  createProjectKnowledgeGraphTool({
    userId: "member-1",
    projectId,
    collectionIds: [collectionId],
  }) as unknown as { execute: (input: { query: string }) => Promise<any> };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.query.mockResolvedValue([]);
  mocks.select.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: (predicate: unknown) => {
            mocks.predicates.push(predicate);
            return {
              orderBy: () => ({ limit: mocks.query }),
            };
          },
        }),
      }),
    }),
  });
});

describe("project knowledge graph chat tool", () => {
  it("returns only matching reviewed claims from currently scoped sources", async () => {
    mocks.query
      .mockResolvedValueOnce([
        {
          id: "event-1",
          summary: "Release approved",
          detail: "Review completed",
          eventDate: "2026-01-09",
          evidence: "The release was approved on 2026-01-09.",
          sourceItemId: "item-event",
          filename: "release.md",
          sourceUrl: null,
          sourceCollectionId: collectionId,
          sourceOwnerId: "member-1",
          sourceStatus: "ready",
          eventStatus: "accepted",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "fact-1",
          subject: "Void Agent",
          predicate: "uses",
          object: "PostgreSQL",
          evidence: "The project uses PostgreSQL for persistence.",
          confidence: 0.92,
          sourceItemId: "item-1",
          filename: "architecture.md",
          sourceUrl: null,
          sourceCollectionId: collectionId,
          sourceOwnerId: "member-1",
          sourceStatus: "ready",
          reviewStatus: "accepted",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "fact-2",
          subject: "Void Agent",
          predicate: "has",
          object: "desktop app",
          evidence: "A desktop companion exists.",
          confidence: 0.8,
          sourceItemId: "item-2",
          filename: "desktop.md",
          sourceUrl: null,
          sourceCollectionId: collectionId,
          sourceOwnerId: "member-1",
          sourceStatus: "ready",
          reviewStatus: "proposed",
          createdAt: new Date("2026-01-02T00:00:00Z"),
        },
      ]);

    const result = await createTool().execute({
      query: "PostgreSQL persistence",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      claim: "Void Agent uses PostgreSQL",
      evidence: "The project uses PostgreSQL for persistence.",
      source: "architecture.md",
    });
    expect(result.recentEvents).toEqual([
      {
        id: "event-1",
        date: "2026-01-09",
        summary: "Release approved",
        detail: "Review completed",
        evidence: "The release was approved on 2026-01-09.",
        source: "release.md",
      },
    ]);
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(projectId, "member-1");
    expect(mocks.query).toHaveBeenCalledTimes(2);
    const eventPredicate = new PgDialect().sqlToQuery(
      mocks.predicates[0] as never,
    );
    expect(eventPredicate.sql).toContain('"project_brain_event"."project_id"');
    expect(eventPredicate.sql).toContain('"project_brain_event"."status"');
    expect(eventPredicate.sql).toContain('"collection_item"."collection_id"');
    expect(eventPredicate.sql).toContain('"collection"."user_id"');
    expect(eventPredicate.sql).toContain('"collection_item"."status"');
    expect(eventPredicate.sql).toContain('"project_brain_source_state"');
    expect(eventPredicate.params).toContain("accepted");
  });

  it("expands an accepted alias hit into canonical entity claims", async () => {
    const source = {
      sourceItemId: "item-1",
      filename: "architecture.md",
      sourceUrl: null,
      sourceCollectionId: collectionId,
      sourceOwnerId: "member-1",
      sourceStatus: "ready",
      reviewStatus: "accepted",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...source,
          id: "alias-fact",
          subject: "Northstar",
          predicate: "alias",
          object: "North Star",
          evidence: "Northstar is also known as North Star.",
          confidence: 0.95,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...source,
          id: "owner-fact",
          subject: "Northstar",
          predicate: "owner",
          object: "Riya",
          evidence: "Riya leads Northstar.",
          confidence: 0.9,
        },
      ]);

    const result = await createTool().execute({ query: "North Star" });

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim: "Northstar alias North Star",
          matchedBy: "text",
        }),
        expect.objectContaining({
          claim: "Northstar owner Riya",
          matchedBy: "entity-or-alias",
        }),
      ]),
    );
  });

  it("returns no project facts after membership is revoked", async () => {
    mocks.getProjectAccess.mockResolvedValue(null);
    const result = await createTool().execute({ query: "PostgreSQL" });
    expect(result.success).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects an empty or too-short query before database access", async () => {
    const result = await createTool().execute({ query: "!!" });
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
  });
});
