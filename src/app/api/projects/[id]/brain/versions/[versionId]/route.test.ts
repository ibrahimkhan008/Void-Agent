import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  predicates: [] as unknown[],
  joins: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId, versionId }) };
const content = "An immutable source revision.";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
const sourceItemId = "00000000-0000-4000-8000-000000000004";

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: (_table: unknown, predicate?: unknown) => {
      if (predicate) mocks.joins.push(predicate);
      return builder;
    },
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.joins.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockImplementation(() =>
    query([
      {
        content,
        contentLength: content.length,
        sourceItemId,
        sourceFingerprint: projectBrainSourceFingerprint(sourceItemId, content),
      },
    ]),
  );
});

describe("GET project brain source revision", () => {
  it("requires authentication and current project access before reading a snapshot", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      401,
    );
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns a no-store revision only through currently visible owner collections", async () => {
    const response = await GET(new Request("https://void.test"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      content,
      contentLength: content.length,
    });
    expect(mocks.getProjectCollectionSourceOwnerIds).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ collectionIds: [collectionId] }),
      }),
    );
    expect(mocks.predicates).toHaveLength(1);
    const predicate = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(predicate.sql).toContain('"project_brain_source_version"."id" =');
    const versionRunJoin = mocks.joins
      .map((join) => new PgDialect().sqlToQuery(join as never).sql)
      .find((sql) => sql.includes('"project_brain_run"."source_version_id"'));
    expect(versionRunJoin).toContain('"project_brain_source_version"."id"');
    expect(predicate.sql).toContain('"collection_item"."collection_id" in');
    expect(predicate.sql).toContain('"collection"."user_id" in');
    expect(predicate.sql).toContain('"collection_item"."status" =');
    expect(predicate.sql).toContain('"project_brain_source_state"');
    expect(predicate.params).toContain(projectId);
    expect(predicate.params).toContain(versionId);
    expect(predicate.params).toContain(collectionId);
    expect(predicate.params).toContain("owner-1");
    expect(predicate.params).toContain("ready");
  });

  it("hides missing, legacy, and oversized revisions and applies rate limits", async () => {
    mocks.select.mockImplementationOnce(() => query([]));
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );
    mocks.select.mockImplementationOnce(() =>
      query([
        {
          content: null,
          contentLength: 0,
          sourceItemId,
          sourceFingerprint: "",
        },
      ]),
    );
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );
    mocks.select.mockImplementationOnce(() =>
      query([
        {
          content: "x".repeat(60_001),
          contentLength: 60_001,
          sourceItemId,
          sourceFingerprint: "",
        },
      ]),
    );
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );
    mocks.checkApiRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      429,
    );
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });
});
