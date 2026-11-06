import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: mocks }));

import { mergeProjectBrainPages } from "./merge-brain-pages";

const projectId = "project-1";
const survivorId = "page-survivor";
const mergedId = "page-merged";

function makePage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectId,
    entityType: "person",
    title: id === survivorId ? "Riya Shah" : "R. Shah",
    normalizedTitle: id.toLowerCase(),
    mergedIntoPageId: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    for: async () => rows,
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

function configure(
  pages = [makePage(survivorId), makePage(mergedId)],
  identities = [
    { pageId: survivorId, entityType: "person" },
    { pageId: mergedId, entityType: "person" },
  ],
) {
  mocks.select
    .mockReturnValueOnce(query(pages))
    .mockReturnValueOnce(query(identities));
  mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  mocks.update.mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReset();
  mocks.insert.mockReset();
  mocks.update.mockReset();
});

const input = {
  projectId,
  survivorPageId: survivorId,
  mergedPageId: mergedId,
  actorUserId: "editor-1",
  collectionIds: ["collection-1"],
  ownerIds: ["owner-1"],
};

describe("mergeProjectBrainPages", () => {
  it("records a merge and repoints facts and aliases inside the caller transaction", async () => {
    configure();
    const result = await mergeProjectBrainPages(mocks as never, input);

    expect(result).toEqual({
      status: "merged",
      survivorPageId: survivorId,
      mergedPageId: mergedId,
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledTimes(5);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("refuses different entity types without writes", async () => {
    configure([
      makePage(survivorId, { entityType: "person" }),
      makePage(mergedId, { entityType: "organization" }),
    ]);
    const result = await mergeProjectBrainPages(mocks as never, input);

    expect(result).toEqual({ status: "type-mismatch" });
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses pages without currently visible accepted identity evidence", async () => {
    configure(undefined, [{ pageId: survivorId, entityType: "person" }]);
    const result = await mergeProjectBrainPages(mocks as never, input);

    expect(result).toEqual({ status: "source-unavailable" });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("treats a retried merge as idempotent and rejects already-archived pages", async () => {
    const mergedAt = new Date("2026-02-01T00:00:00Z");
    configure([
      makePage(survivorId),
      makePage(mergedId, {
        mergedIntoPageId: survivorId,
        archivedAt: mergedAt,
      }),
    ]);
    const result = await mergeProjectBrainPages(mocks as never, input);

    expect(result).toEqual({
      status: "already-merged",
      survivorPageId: survivorId,
      mergedPageId: mergedId,
    });
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
