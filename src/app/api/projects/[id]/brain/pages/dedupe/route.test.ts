import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  judgeBrainPageDuplicateCandidates: vi.fn(),
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
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock(
  "lib/projects/brain-page-duplicate-candidates",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("lib/projects/brain-page-duplicate-candidates")
      >();
    return {
      ...original,
      judgeBrainPageDuplicateCandidates:
        mocks.judgeBrainPageDuplicateCandidates,
    };
  },
);

import { POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const pageA = "00000000-0000-4000-8000-000000000003";
const pageB = "00000000-0000-4000-8000-000000000004";
const params = { params: Promise.resolve({ id: projectId }) };

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

function makeRequest(
  payload: unknown = { pairs: [{ firstPageId: pageA, secondPageId: pageB }] },
  origin = "https://void.test",
) {
  return new Request(
    `https://void.test/api/projects/${projectId}/brain/pages/dedupe`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

const visibleFacts = [
  {
    pageId: pageA,
    title: "Riya Shah",
    entityType: "person",
    salience: 2,
    subject: "Riya Shah",
    predicate: "entity type",
    object: "person",
    evidence: "Riya Shah is a person.",
  },
  {
    pageId: pageA,
    title: "Riya Shah",
    entityType: "person",
    salience: 2,
    subject: "Riya Shah",
    predicate: "works at",
    object: "Northwind",
    evidence: "Riya Shah works at Northwind.",
  },
  {
    pageId: pageB,
    title: "Riya Sha",
    entityType: "person",
    salience: 1,
    subject: "Riya Sha",
    predicate: "entity type",
    object: "person",
    evidence: "Riya Sha is a person.",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "editor-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    role: "editor",
    project: { collectionIds: [collectionId] },
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockReturnValue(query(visibleFacts));
  mocks.judgeBrainPageDuplicateCandidates.mockResolvedValue([
    {
      firstPageId: pageA,
      secondPageId: pageB,
      verdict: "same_entity",
      explanation: "Both accepted claims identify the same person.",
    },
  ]);
});

describe("POST project brain duplicate judgment", () => {
  it("judges only a current, visible, accepted candidate and returns an advisory result", async () => {
    const response = await POST(makeRequest(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      results: [
        { verdict: "same_entity", firstPageId: pageA, secondPageId: pageB },
      ],
    });
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.sql).toContain('"collection_item"."collection_id"');
    expect(query.sql).toContain('"collection"."user_id"');
    expect(query.sql).toContain('"collection_item"."status"');
    expect(query.sql).toContain('"project_brain_source_state"');
    expect(query.sql).toContain('"project_brain_fact"."review_status"');
    expect(mocks.judgeBrainPageDuplicateCandidates).toHaveBeenCalledWith([
      expect.objectContaining({
        firstPageId: pageA,
        firstFacts: expect.arrayContaining([
          expect.objectContaining({ claim: "Riya Shah works at Northwind" }),
        ]),
      }),
    ]);
  });

  it("rejects cross-origin, viewers and invalid pairs before querying evidence", async () => {
    expect(
      (await POST(makeRequest(undefined, "https://attacker.invalid"), params))
        .status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { collectionIds: [collectionId] },
    });
    expect((await POST(makeRequest(), params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId] },
    });
    expect(
      (
        await POST(
          makeRequest({ pairs: [{ firstPageId: pageA, secondPageId: pageA }] }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("refuses a pair that is no longer backed by current visible identity evidence", async () => {
    mocks.select.mockReturnValue(query(visibleFacts.slice(0, 1)));
    const response = await POST(makeRequest(), params);
    expect(response.status).toBe(409);
    expect(mocks.judgeBrainPageDuplicateCandidates).not.toHaveBeenCalled();
  });
});
