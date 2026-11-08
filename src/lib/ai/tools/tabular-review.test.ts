import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  selectDistinct: vi.fn(),
  transaction: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: mocks }));

import {
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewSourceDocumentTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { createTabularReviewTool } from "./tabular-review";

const input = {
  title: "Review",
  itemIds: ["00000000-0000-4000-8000-000000000001"],
  columns: [
    {
      id: "summary",
      label: "Summary",
      type: "text" as const,
      preset: "summary" as const,
    },
  ],
};

function getExecute() {
  return (
    createTabularReviewTool({
      userId: "user-1",
      threadCollectionIds: ["collection-1"],
      allowedSources: [
        {
          itemId: input.itemIds[0],
          filename: "source.pdf",
          collectionName: "Documents",
        },
      ],
    }) as unknown as {
      execute: (
        value: typeof input,
        options?: { abortSignal?: AbortSignal },
      ) => Promise<unknown>;
    }
  ).execute;
}

function setupSourceQueries(
  onSourcesValidated?: () => void,
  sourceDocuments = [
    {
      itemId: input.itemIds[0],
      documentId: "document-old",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      itemId: input.itemIds[0],
      documentId: "document-new",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    },
  ],
) {
  mocks.select.mockReturnValueOnce({
    from: () => ({ where: async () => [{ id: "collection-1" }] }),
  });
  const documentQuery: Record<string, unknown> = {};
  documentQuery.innerJoin = () => documentQuery;
  documentQuery.where = async (predicate: unknown) => {
    mocks.predicates.push(predicate);
    return sourceDocuments;
  };
  mocks.select.mockReturnValueOnce({
    from: () => documentQuery,
  });
  mocks.selectDistinct.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          where: async () => {
            onSourcesValidated?.();
            return [{ itemId: input.itemIds[0] }];
          },
        }),
      }),
    }),
  });
}

describe("createTabularReview cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.predicates.length = 0;
  });

  it("does not query sources or write when the chat turn is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      getExecute()(input, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.selectDistinct).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not start the transaction if cancellation happens during source validation", async () => {
    const controller = new AbortController();
    setupSourceQueries(() => controller.abort());

    await expect(
      getExecute()(input, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects inside the atomic write transaction if cancellation happens before child rows are written", async () => {
    const controller = new AbortController();
    setupSourceQueries();
    const insert = vi.fn((table: unknown) => ({
      values: () => ({
        returning: async () => {
          expect(table).toBe(TabularReviewTable);
          controller.abort();
          return [{ id: "review-1", title: "Review" }];
        },
      }),
    }));
    let rolledBack = false;
    mocks.transaction.mockImplementation(async (callback) => {
      try {
        return await callback({ insert });
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });

    await expect(
      getExecute()(input, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(rolledBack).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(TabularReviewTable);
    expect(insert).not.toHaveBeenCalledWith(TabularReviewItemTable);
    expect(insert).not.toHaveBeenCalledWith(TabularReviewSourceDocumentTable);
    expect(insert).not.toHaveBeenCalledWith(TabularReviewCellTable);
  });

  it("pins every authorized current source revision in the atomic chat-created review", async () => {
    setupSourceQueries();
    const insertCalls: Array<{ table: unknown; values: unknown }> = [];
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        insertCalls.push({ table, values });
        return table === TabularReviewTable
          ? {
              returning: async () => [
                { id: "review-created", title: "Review" },
              ],
            }
          : Promise.resolve();
      }),
    }));
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ insert } as never),
    );

    await expect(getExecute()(input)).resolves.toEqual({
      id: "review-created",
      title: "Review",
      documentCount: 1,
      columnCount: 1,
    });

    const pinned = insertCalls.find(
      (call) => call.table === TabularReviewSourceDocumentTable,
    );
    expect(pinned?.values).toEqual([
      {
        reviewId: "review-created",
        itemId: input.itemIds[0],
        documentId: "document-old",
        position: 0,
      },
      {
        reviewId: "review-created",
        itemId: input.itemIds[0],
        documentId: "document-new",
        position: 1,
      },
    ]);
    expect(insertCalls.map((call) => call.table)).toEqual([
      TabularReviewTable,
      TabularReviewItemTable,
      TabularReviewSourceDocumentTable,
      TabularReviewCellTable,
    ]);
    const sourceQuery = new PgDialect().sqlToQuery(
      mocks.predicates[0] as never,
    );
    expect(sourceQuery.sql).toContain('"collection_item"."id" in');
    expect(sourceQuery.sql).toContain('"collection_item"."collection_id" in');
    expect(sourceQuery.sql).toContain('"collection"."user_id" in');
    expect(sourceQuery.sql).toContain('"collection_item"."status" =');
    expect(sourceQuery.params).toContain("user-1");
    expect(sourceQuery.params).toContain("ready");
  });

  it("refuses an item when all extracted source revisions disappeared", async () => {
    setupSourceQueries(undefined, []);

    await expect(getExecute()(input)).resolves.toMatchObject({
      error: "One or more sources have no extracted text.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
