import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertConflict: vi.fn(),
  transaction: vi.fn(),
  checkApiRateLimit: vi.fn(),
  mergeProjectBrainPages: vi.fn(),
  listStaleProjectBrainPages: vi.fn(),
  listRestorableProjectBrainPages: vi.fn(),
  archiveStaleProjectBrainPage: vi.fn(),
  restoreProjectBrainPage: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: mocks.select,
    selectDistinct: mocks.select,
    transaction: mocks.transaction,
    insert: mocks.insert,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/projects/merge-brain-pages", () => ({
  mergeProjectBrainPages: mocks.mergeProjectBrainPages,
}));
vi.mock("lib/projects/brain-page-archive", () => ({
  listStaleProjectBrainPages: mocks.listStaleProjectBrainPages,
  listRestorableProjectBrainPages: mocks.listRestorableProjectBrainPages,
  archiveStaleProjectBrainPage: mocks.archiveStaleProjectBrainPage,
  restoreProjectBrainPage: mocks.restoreProjectBrainPage,
}));

import { GET, PATCH, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const pageId = "00000000-0000-4000-8000-000000000003";
const secondPageId = "00000000-0000-4000-8000-000000000004";
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
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  mocks.mergeProjectBrainPages.mockResolvedValue({
    status: "merged",
    survivorPageId: pageId,
    mergedPageId: "00000000-0000-4000-8000-000000000004",
  });
  mocks.listStaleProjectBrainPages.mockResolvedValue([]);
  mocks.listRestorableProjectBrainPages.mockResolvedValue([]);
  mocks.archiveStaleProjectBrainPage.mockResolvedValue(true);
  mocks.restoreProjectBrainPage.mockResolvedValue(true);
  mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({}),
  );
  mocks.insertConflict.mockResolvedValue([]);
  mocks.insertValues.mockReturnValue({
    onConflictDoNothing: mocks.insertConflict,
  });
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
});

describe("POST project brain page merge", () => {
  const mergedPageId = "00000000-0000-4000-8000-000000000004";
  const body = { survivorPageId: pageId, mergedPageId };
  const request = (origin = "https://void.test", payload: unknown = body) =>
    new Request(`https://void.test/api/projects/${projectId}/brain/pages`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  it("requires authentication, same-origin, and an editor before merging", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request(), params)).status).toBe(401);
    expect((await POST(request("https://attacker.test"), params)).status).toBe(
      403,
    );
    mocks.getProjectAccess.mockResolvedValueOnce({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    expect((await POST(request(), params)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("runs a same-type page merge in a database transaction and returns no-store", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    const response = await POST(request(), params);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "merged",
      survivorPageId: pageId,
      mergedPageId,
    });
    expect(mocks.checkApiRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "project-brain-page-merge",
        id: "member-1",
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.mergeProjectBrainPages).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        projectId,
        actorUserId: "member-1",
        collectionIds: [collectionId],
        ownerIds: ["member-1"],
        ...body,
      }),
    );
  });

  it("rejects malformed merge IDs before rate limiting or database work", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    const response = await POST(
      request("https://void.test", { survivorPageId: "bad", mergedPageId }),
      params,
    );

    expect(response.status).toBe(400);
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("GET project brain pages", () => {
  it("returns no source-derived page data when no current source is visible", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [] },
      role: "viewer",
    });
    const response = await GET(
      new Request(`https://void.test/api/projects/${projectId}/brain/pages`),
      params,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      pages: [],
      duplicateCandidates: [],
      stalePages: [],
      restorablePages: [],
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns only accepted typed pages and aliases with current source scope", async () => {
    const pageRows = [
      {
        id: pageId,
        title: "Riya Shah",
        entityType: "person",
        normalizedTitle: "riya shah",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    mocks.select
      .mockReturnValueOnce(query(pageRows))
      .mockReturnValueOnce(query([{ pageId, alias: "R. Shah" }]))
      .mockReturnValueOnce(query([]));

    const response = await GET(
      new Request(`https://void.test/api/projects/${projectId}/brain/pages`),
      params,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pages: [
        {
          id: pageId,
          title: "Riya Shah",
          entityType: "person",
          aliases: ["R. Shah"],
        },
      ],
    });
    expect(mocks.select).toHaveBeenCalledTimes(3);
    expect(mocks.predicates).toHaveLength(3);
    for (const predicate of mocks.predicates.slice(0, 2)) {
      const where = new PgDialect().sqlToQuery(predicate as never);
      expect(where.sql).toContain('"collection_item"."collection_id"');
      expect(where.sql).toContain('"collection"."user_id"');
      expect(where.sql).toContain('"collection_item"."status"');
      expect(where.params).toContain(projectId);
    }
  });

  it("includes stale and currently restorable page choices from live project scope", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    const stale = [
      {
        id: "stale",
        title: "Old Entity",
        entityType: "person",
        updatedAt: new Date("2025-01-01"),
      },
    ];
    const restorable = [
      {
        id: "archived",
        title: "Recovered Entity",
        entityType: "person",
        archivedAt: new Date("2026-01-01"),
      },
    ];
    mocks.listStaleProjectBrainPages.mockResolvedValue(stale);
    mocks.listRestorableProjectBrainPages.mockResolvedValue(restorable);
    mocks.select.mockReturnValueOnce(query([]));

    const response = await GET(
      new Request(`https://void.test/api/projects/${projectId}/brain/pages`),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stalePages: [
        { ...stale[0], updatedAt: stale[0]!.updatedAt.toISOString() },
      ],
      restorablePages: [
        {
          ...restorable[0],
          archivedAt: restorable[0]!.archivedAt.toISOString(),
        },
      ],
    });
    expect(mocks.listStaleProjectBrainPages).toHaveBeenCalledWith({
      projectId,
      collectionIds: [collectionId],
      ownerIds: ["member-1"],
    });
  });
});

describe("PATCH project brain page pair review", () => {
  const makeRequest = (
    origin = "https://void.test",
    payload: unknown = {
      action: "not_same",
      firstPageId: secondPageId,
      secondPageId: pageId,
    },
  ) =>
    new Request(`https://void.test/api/projects/${projectId}/brain/pages`, {
      method: "PATCH",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  it("persists a same-type not-same decision only for visible current-source pages", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.select.mockReturnValue(
      query([
        { id: pageId, entityType: "person" },
        { id: secondPageId, entityType: "person" },
      ]),
    );
    const response = await PATCH(makeRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "dismissed" });
    expect(mocks.insertValues).toHaveBeenCalledWith({
      firstPageId: pageId,
      secondPageId,
      actorUserId: "member-1",
    });
    const scope = new PgDialect().sqlToQuery(mocks.predicates.at(-1) as never);
    expect(scope.sql).toContain('"collection_item"."collection_id"');
    expect(scope.sql).toContain('"collection"."user_id"');
    expect(scope.sql).toContain('"collection_item"."status"');
  });

  it("rejects cross-origin, viewer, malformed, and inaccessible decisions", async () => {
    expect(
      (await PATCH(makeRequest("https://attacker.test"), params)).status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "viewer",
    });
    expect((await PATCH(makeRequest(), params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    expect(
      (
        await PATCH(
          makeRequest("https://void.test", {
            firstPageId: "bad",
            secondPageId,
          }),
          params,
        )
      ).status,
    ).toBe(400);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.select.mockReturnValue(query([{ id: pageId, entityType: "person" }]));
    expect((await PATCH(makeRequest(), params)).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("PATCH stale page archival and restoration", () => {
  const pageRequest = (action: "archive_stale" | "restore") =>
    new Request(`https://void.test/api/projects/${projectId}/brain/pages`, {
      method: "PATCH",
      headers: {
        Origin: "https://void.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, pageId }),
    });

  it("archives and restores through scope-bound helpers", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });

    const archived = await PATCH(pageRequest("archive_stale"), params);
    expect(archived.status).toBe(200);
    expect(await archived.json()).toEqual({ status: "archived" });
    expect(mocks.archiveStaleProjectBrainPage).toHaveBeenCalledWith({
      projectId,
      collectionIds: [collectionId],
      ownerIds: ["member-1"],
      pageId,
    });

    const restored = await PATCH(pageRequest("restore"), params);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ status: "restored" });
    expect(mocks.restoreProjectBrainPage).toHaveBeenCalledWith({
      projectId,
      collectionIds: [collectionId],
      ownerIds: ["member-1"],
      pageId,
    });
  });

  it("refuses to archive or restore pages that fail the current source check", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [collectionId] },
      role: "editor",
    });
    mocks.archiveStaleProjectBrainPage.mockResolvedValue(false);
    mocks.restoreProjectBrainPage.mockResolvedValue(false);
    expect((await PATCH(pageRequest("archive_stale"), params)).status).toBe(
      409,
    );
    expect((await PATCH(pageRequest("restore"), params)).status).toBe(409);
  });
});
