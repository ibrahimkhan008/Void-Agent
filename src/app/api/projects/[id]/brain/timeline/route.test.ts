import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: projectId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { collectionIds: [collectionId] },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return query;
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: "event-1",
        summary: "Launch review",
        detail: null,
        evidence: "The team met on 2026-10-20.",
        eventDate: "2026-10-20",
        status: "accepted",
        createdAt: new Date("2026-10-21T00:00:00Z"),
        sourceItemId: "source-1",
        filename: "plan.md",
        collectionId,
      },
    ]),
  };
  mocks.select.mockReturnValue(query);
});

describe("GET project brain timeline", () => {
  it("requires project access and never returns events without visible collections", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(
      401,
    );
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getProjectAccess.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(
      404,
    );
    mocks.getProjectAccess.mockResolvedValue({
      project: { collectionIds: [] },
      role: "viewer",
    });
    const empty = await GET(new Request("http://localhost"), params);
    expect((await empty.json()).events).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("scopes events to current project source revisions and limits viewers to accepted events", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { collectionIds: [collectionId] },
      role: "viewer",
    });
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).events).toEqual([
      expect.objectContaining({
        status: "accepted",
        evidence: "The team met on 2026-10-20.",
      }),
    ]);
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.sql).toContain('"project_brain_source_state"');
    expect(query.sql).toContain('"collection_item"."status"');
    expect(query.sql).toContain('"project_brain_event"."status"');
  });
});
