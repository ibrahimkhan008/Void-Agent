import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const reads: unknown[][] = [];
  const update = vi.fn();
  const tx = {
    select: vi.fn(() => {
      const rows = reads.shift() ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["from", "where", "for", "orderBy"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.limit = vi.fn(async () => rows);
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }),
    update,
  };
  return {
    reads,
    tx,
    getSession: vi.fn(),
    checkApiRateLimit: vi.fn(),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
});

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModelWithFailureFallbackAsync: vi.fn() },
}));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { transaction: mocks.transaction },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  CollectionItemTable: { id: {}, filename: {}, collectionId: {}, status: {} },
  CollectionTable: { id: {}, userId: {} },
  DocumentTable: { collectionItemId: {}, content: {}, createdAt: {} },
  TabularReviewCellTable: {
    id: {},
    reviewId: {},
    itemId: {},
    columnId: {},
    status: {},
    value: {},
  },
  TabularReviewItemTable: { itemId: {}, reviewId: {}, rowIndex: {} },
  TabularReviewTable: {
    id: {},
    userId: {},
    status: {},
    updatedAt: {},
    columns: {},
  },
}));

import { POST } from "./route";

const reviewId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const existingItemId = "00000000-0000-4000-8000-000000000003";
const invalidItemId = "00000000-0000-4000-8000-000000000004";

describe("tabular review generation target validation", () => {
  beforeEach(() => {
    mocks.reads.length = 0;
    mocks.tx.select.mockClear();
    mocks.tx.update.mockReset();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.transaction.mockClear();
    mocks.transaction.mockImplementation(
      async (callback: (value: typeof mocks.tx) => unknown) =>
        callback(mocks.tx),
    );
  });

  it("rejects an out-of-scope cell without changing review status or updatedAt", async () => {
    const updatedAt = new Date("2026-11-06T12:00:00.000Z");
    mocks.reads.push(
      [{ id: reviewId, userId, status: "done", updatedAt, columns: [] }],
      [
        {
          itemId: existingItemId,
          columnId: "summary",
          status: "done",
          value: "Existing",
        },
      ],
    );

    const response = await POST(
      new Request(`http://localhost/api/tabular-reviews/${reviewId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: invalidItemId, columnId: "summary" }),
      }),
      { params: Promise.resolve({ id: reviewId }) },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Review cell not found");
    expect(mocks.tx.update).not.toHaveBeenCalled();
  });
});
