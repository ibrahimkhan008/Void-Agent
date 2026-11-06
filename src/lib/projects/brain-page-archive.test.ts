import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  predicates: [] as unknown[],
  limits: [] as number[],
  updateRows: [] as Array<{ id: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, update: mocks.update },
}));

import {
  archiveStaleProjectBrainPage,
  listRestorableProjectBrainPages,
  listStaleProjectBrainPages,
  restoreProjectBrainPage,
} from "./brain-page-archive";

const scope = {
  projectId: "00000000-0000-4000-8000-000000000001",
  collectionIds: ["00000000-0000-4000-8000-000000000002"],
  ownerIds: ["00000000-0000-4000-8000-000000000003"],
};
const pageId = "00000000-0000-4000-8000-000000000004";

function query(rows: unknown[] = []) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: (limit: number) => {
      mocks.limits.push(limit);
      return builder;
    },
    returning: () => Promise.resolve(mocks.updateRows),
    getSQL: () => sql`SELECT 1`,
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
  mocks.limits.length = 0;
  mocks.updateRows = [{ id: pageId }];
  mocks.select.mockImplementation(() => query());
  mocks.update.mockReturnValue({ set: () => query() });
});

describe("project brain stale page lifecycle", () => {
  it("does not query or mutate when the project has no visible source scope", async () => {
    const noScope = { ...scope, collectionIds: [], ownerIds: [] };
    await expect(listStaleProjectBrainPages(noScope)).resolves.toEqual([]);
    await expect(listRestorableProjectBrainPages(noScope)).resolves.toEqual([]);
    await expect(
      archiveStaleProjectBrainPage({ ...noScope, pageId }),
    ).resolves.toBe(false);
    await expect(restoreProjectBrainPage({ ...noScope, pageId })).resolves.toBe(
      false,
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("finds only old, unmerged active pages with historical visible evidence but no current accepted identity fact", async () => {
    await listStaleProjectBrainPages(scope);
    expect(mocks.limits).toEqual([100]);
    const generated = mocks.predicates.map((predicate) =>
      new PgDialect().sqlToQuery(predicate as never),
    );
    const sourceQueries = generated.map(({ sql: queryText }) => queryText);
    expect(
      sourceQueries.some((text) =>
        text.includes('"collection_item"."collection_id"'),
      ),
    ).toBe(true);
    expect(
      sourceQueries.some((text) => text.includes('"collection"."user_id"')),
    ).toBe(true);
    expect(
      sourceQueries.some((text) => text.includes('"collection_item"."status"')),
    ).toBe(true);
    expect(
      sourceQueries.some((text) =>
        text.includes('"project_brain_source_state"'),
      ),
    ).toBe(true);
    expect(
      sourceQueries.some((text) =>
        text.includes('"project_brain_fact"."review_status"'),
      ),
    ).toBe(true);
    expect(
      sourceQueries.some((text) =>
        text.includes('"project_brain_page"."updated_at"'),
      ),
    ).toBe(true);
  });

  it("archives and restores with single-statement current-source guards", async () => {
    await expect(
      archiveStaleProjectBrainPage({ ...scope, pageId }),
    ).resolves.toBe(true);
    const archivedPredicate = new PgDialect().sqlToQuery(
      mocks.predicates.at(-1) as never,
    );
    expect(archivedPredicate.sql).toContain(
      '"project_brain_page"."archived_at" is null',
    );
    expect(archivedPredicate.sql).toContain(
      '"project_brain_page"."merged_into_page_id" is null',
    );

    await expect(restoreProjectBrainPage({ ...scope, pageId })).resolves.toBe(
      true,
    );
    const restorePredicate = new PgDialect().sqlToQuery(
      mocks.predicates.at(-1) as never,
    );
    expect(restorePredicate.sql).toContain(
      '"project_brain_page"."archived_at" is not null',
    );
    expect(
      mocks.predicates.some((predicate) =>
        new PgDialect()
          .sqlToQuery(predicate as never)
          .sql.includes('"project_brain_source_state"'),
      ),
    ).toBe(true);
  });

  it("reports a concurrent state change instead of claiming an archive succeeded", async () => {
    mocks.updateRows = [];
    await expect(
      archiveStaleProjectBrainPage({ ...scope, pageId }),
    ).resolves.toBe(false);
  });
});
