import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: projectId }) };

type GraphRow = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  reviewStatus: string;
  sourceCollectionId: string;
  sourceOwnerId: string;
  sourceStatus: string;
  subjectPageId?: string | null;
  objectPageId?: string | null;
  evidence?: string;
  confidence?: number;
  sourceItemId?: string;
  filename?: string | null;
  sourceUrl?: string | null;
  factCapturedAt?: Date;
};
const baseRows: GraphRow[] = [
  {
    id: "a",
    subject: "Project",
    predicate: "owns",
    object: "Northstar",
    reviewStatus: "accepted",
    sourceCollectionId: collectionId,
    sourceOwnerId: "owner-1",
    sourceStatus: "ready",
  },
  {
    id: "b",
    subject: "Northstar",
    predicate: "uses",
    object: "PostgreSQL",
    reviewStatus: "proposed",
    sourceCollectionId: collectionId,
    sourceOwnerId: "owner-1",
    sourceStatus: "ready",
  },
  {
    id: "c",
    subject: "PostgreSQL",
    predicate: "runs on",
    object: "Cloud",
    reviewStatus: "accepted",
    sourceCollectionId: collectionId,
    sourceOwnerId: "owner-1",
    sourceStatus: "ready",
  },
  {
    id: "stale",
    subject: "Project",
    predicate: "secret",
    object: "Hidden",
    reviewStatus: "accepted",
    sourceCollectionId: "detached",
    sourceOwnerId: "owner-1",
    sourceStatus: "ready",
  },
];
let rows: GraphRow[] = [...baseRows];

beforeEach(() => {
  vi.clearAllMocks();
  rows = [...baseRows];
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
  mocks.select.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: mocks.limit.mockResolvedValue(rows),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
  });
});

describe("GET project brain graph", () => {
  it("returns only current source-backed facts and a bounded focused neighborhood", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/projects/x/brain/graph?focus=project&depth=1",
      ),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.nodes.map((node: { id: string }) => node.id)).toEqual([
      "project",
      "northstar",
    ]);
    expect(body.edges.map((edge: { id: string }) => edge.id)).toEqual(["a"]);
    expect(JSON.stringify(body)).not.toContain("Hidden");
    expect(mocks.getProjectCollectionSourceOwnerIds).toHaveBeenCalled();
  });

  it("returns canonical page IDs for typed graph entities", async () => {
    rows.splice(0, rows.length, {
      ...baseRows[0]!,
      subjectPageId: "00000000-0000-4000-8000-000000000011",
      subject: "North Star",
      object: "Riya",
    });
    const response = await GET(
      new Request("http://localhost/api/projects/x/brain/graph"),
      params,
    );
    const body = await response.json();
    expect(
      body.nodes.find((node: { label: string }) => node.label === "North Star")
        .id,
    ).toBe("00000000-0000-4000-8000-000000000011");
  });

  it("returns only persisted contradictions whose two source facts remain visible", async () => {
    mocks.limit.mockResolvedValueOnce(rows).mockResolvedValueOnce([
      {
        id: "visible-conflict",
        factIdA: "a",
        factIdB: "b",
        verdict: "contradiction",
        status: "open",
        explanation: "Conflicting source claims.",
      },
      {
        id: "hidden-conflict",
        factIdA: "a",
        factIdB: "stale",
        verdict: "contradiction",
        status: "open",
        explanation: "Must not leak.",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/projects/x/brain/graph"),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.reviewedContradictions.map((entry: { id: string }) => entry.id),
    ).toEqual(["visible-conflict"]);
    expect(JSON.stringify(body)).not.toContain("Must not leak");
  });

  it("includes source provenance on current potential contradiction pairs", async () => {
    rows.splice(
      0,
      rows.length,
      {
        ...baseRows[0]!,
        subject: "Release",
        predicate: "status",
        object: "ready",
        evidence: "Release is ready.",
        filename: "release-plan.md",
        factCapturedAt: new Date("2026-11-01T10:00:00.000Z"),
      },
      {
        ...baseRows[0]!,
        id: "second-current-fact",
        subject: "Release",
        predicate: "status",
        object: "blocked",
        evidence: "Release is blocked.",
        filename: "incident-report.md",
        factCapturedAt: new Date("2026-11-02T10:00:00.000Z"),
      },
    );

    const response = await GET(
      new Request("http://localhost/api/projects/x/brain/graph"),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.contradictions).toHaveLength(1);
    expect(body.contradictions[0].first).toMatchObject({
      filename: "release-plan.md",
      evidence: "Release is ready.",
      factCapturedAt: "2026-11-01T10:00:00.000Z",
    });
    expect(body.contradictions[0].second).toMatchObject({
      filename: "incident-report.md",
      evidence: "Release is blocked.",
      factCapturedAt: "2026-11-02T10:00:00.000Z",
    });
  });

  it("rejects invalid focus before project/database work", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/projects/x/brain/graph?focus=bad%0afocus",
      ),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns a shortest path made only from accepted visible claims", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/projects/x/brain/graph?from=Project&to=Northstar",
      ),
      params,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.path.nodes.map((node: { id: string }) => node.id)).toEqual([
      "project",
      "northstar",
    ]);
    expect(body.path.edges.map((edge: { id: string }) => edge.id)).toEqual([
      "a",
    ]);
    expect(JSON.stringify(body)).not.toContain("PostgreSQL");
  });

  it("requires both path endpoints and validates them before database access", async () => {
    const response = await GET(
      new Request("http://localhost/api/projects/x/brain/graph?from=Project"),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(
      401,
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("routes topics only through accepted typed people and visible source-backed claims", async () => {
    rows.splice(
      0,
      rows.length,
      ...baseRows,
      {
        id: "person-type",
        subject: "Jane Doe",
        predicate: "entity type",
        object: "person",
        reviewStatus: "accepted",
        evidence: "Jane is a person",
        confidence: 0.9,
        sourceItemId: "source-1",
        filename: "team.md",
        sourceUrl: null,
        sourceCollectionId: collectionId,
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
      {
        id: "person-alias",
        subject: "Jane Doe",
        predicate: "alias",
        object: "J. Doe",
        reviewStatus: "accepted",
        evidence: "Jane is also J. Doe",
        confidence: 0.9,
        sourceItemId: "source-1",
        filename: "team.md",
        sourceUrl: null,
        sourceCollectionId: collectionId,
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
      {
        id: "topic-alias",
        subject: "Search platform",
        predicate: "also known as",
        object: "Retrieval systems",
        reviewStatus: "accepted",
        evidence: "Search platform is retrieval systems",
        confidence: 0.8,
        sourceItemId: "source-1",
        filename: "team.md",
        sourceUrl: null,
        sourceCollectionId: collectionId,
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
      {
        id: "person-link",
        subject: "J. Doe",
        predicate: "leads",
        object: "Search platform",
        reviewStatus: "accepted",
        evidence: "J. Doe leads Search platform",
        confidence: 0.85,
        sourceItemId: "source-1",
        filename: "team.md",
        sourceUrl: null,
        sourceCollectionId: collectionId,
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
      {
        id: "proposed-link",
        subject: "Jane Doe",
        predicate: "advises",
        object: "Search platform",
        reviewStatus: "proposed",
        evidence: "Unreviewed claim",
        confidence: 0.99,
        sourceItemId: "source-1",
        filename: "team.md",
        sourceUrl: null,
        sourceCollectionId: collectionId,
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
      {
        id: "hidden-person",
        subject: "Hidden Person",
        predicate: "entity type",
        object: "person",
        reviewStatus: "accepted",
        evidence: "Hidden",
        confidence: 1,
        sourceItemId: "source-2",
        filename: "private.md",
        sourceUrl: null,
        sourceCollectionId: "detached",
        sourceOwnerId: "owner-1",
        sourceStatus: "ready",
      },
    );
    const response = await GET(
      new Request(
        "http://localhost/api/projects/x/brain/graph?whoKnows=retrieval%20systems",
      ),
      params,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.experts).toHaveLength(1);
    expect(body.experts[0].label).toBe("Jane Doe");
    expect(
      body.experts[0].connections.map((fact: { id: string }) => fact.id),
    ).toEqual(["person-link"]);
    expect(JSON.stringify(body)).not.toContain("Hidden Person");
    expect(JSON.stringify(body)).not.toContain("Unreviewed claim");
  });

  it("rejects malformed expert queries before project/database work", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/projects/x/brain/graph?whoKnows=bad%0afocus",
      ),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
