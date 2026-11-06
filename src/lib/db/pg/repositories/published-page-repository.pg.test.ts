import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  returning: vi.fn(),
  selectedRows: [] as unknown[][],
  deleted: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  execute: mocks.execute,
  select: vi.fn(() => {
    const rows = mocks.selectedRows.shift() ?? [];
    const query: Record<string, any> = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (error: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  }),
  delete: vi.fn(() => ({
    where: vi.fn(async () => {
      mocks.deleted();
      return [];
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((value: { slug: string; version: number }) => ({
      returning: vi.fn(async () => {
        mocks.returning(value);
        return [{ slug: value.slug, version: value.version }];
      }),
    })),
  })),
};

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    transaction: mocks.transaction,
  },
}));

import {
  MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER,
  MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG,
  PublishedPageQuotaError,
} from "lib/published-page/quota";
import { pgPublishedPageRepository } from "./published-page-repository.pg";

const ownerId = "00000000-0000-4000-8000-000000000001";
const pageSlug = `page-${"c".repeat(24)}`;
const row = (input: {
  id: string;
  slug?: string;
  version?: number;
  revokedAt?: Date | null;
  publishedAt?: Date;
}) => ({
  id: input.id,
  slug: input.slug ?? pageSlug,
  version: input.version ?? 1,
  ownerId,
  revokedAt: input.revokedAt ?? null,
  publishedAt: input.publishedAt ?? new Date("2026-01-01T00:00:00Z"),
});

const setQueryRows = (slugRows: unknown[], ownerRows: unknown[]) => {
  mocks.selectedRows.push(slugRows, ownerRows);
};

describe("published page version persistence and quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedRows.length = 0;
    mocks.transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );
    mocks.returning.mockReset();
    mocks.deleted.mockReset();
    mocks.execute.mockReset();
  });

  it("locks owner and slug, then appends the next version", async () => {
    const existing = row({ id: "v3", version: 3 });
    setQueryRows([existing], [existing]);
    const result = await pgPublishedPageRepository.publish({
      slug: pageSlug,
      title: "Version four",
      html: "<h1>v4</h1>",
      ownerId,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    const firstLock = JSON.stringify(mocks.execute.mock.calls[0][0]);
    const secondLock = JSON.stringify(mocks.execute.mock.calls[1][0]);
    expect(firstLock).toContain(`published-page-owner:${ownerId}`);
    expect(secondLock).toContain(`published-page-slug:${pageSlug}`);
    expect(mocks.returning).toHaveBeenCalledWith(
      expect.objectContaining({ version: 4 }),
    );
    expect(mocks.deleted).not.toHaveBeenCalled();
    expect(result.version).toBe(4);
  });

  it("starts a new slug at version one", async () => {
    setQueryRows([], []);
    await pgPublishedPageRepository.publish({
      slug: `new-${"d".repeat(24)}`,
      title: "First",
      html: "<p>First</p>",
      ownerId,
    });
    expect(mocks.returning).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
    );
  });

  it("prunes oldest same-page versions while retaining the configured newest window", async () => {
    const versions = Array.from(
      { length: MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG },
      (_, index) => row({ id: `v${index + 1}`, version: index + 1 }),
    );
    setQueryRows(versions, versions);
    await pgPublishedPageRepository.publish({
      slug: pageSlug,
      title: "Next version",
      html: "<p>Next</p>",
      ownerId,
    });
    expect(mocks.deleted).toHaveBeenCalledOnce();
    expect(mocks.returning).toHaveBeenCalledWith(
      expect.objectContaining({
        version: MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG + 1,
      }),
    );
  });

  it("reclaims revoked snapshots at the owner cap before publishing a new page", async () => {
    const rows = Array.from(
      { length: MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER },
      (_, index) =>
        row({
          id: `owner-${index}`,
          slug: `page-${index}-${"e".repeat(24)}`,
          version: 1,
          revokedAt: index === 0 ? new Date("2026-02-01T00:00:00Z") : null,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
        }),
    );
    setQueryRows([], rows);
    await pgPublishedPageRepository.publish({
      slug: `new-${"d".repeat(24)}`,
      title: "New page",
      html: "<p>New</p>",
      ownerId,
    });
    expect(mocks.deleted).toHaveBeenCalledOnce();
    expect(mocks.returning).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
    );
  });

  it("rejects new pages at the owner cap when all stored pages remain live", async () => {
    const rows = Array.from(
      { length: MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER },
      (_, index) =>
        row({
          id: `owner-${index}`,
          slug: `page-${index}-${"e".repeat(24)}`,
          version: 1,
        }),
    );
    setQueryRows([], rows);
    await expect(
      pgPublishedPageRepository.publish({
        slug: `new-${"d".repeat(24)}`,
        title: "New page",
        html: "<p>New</p>",
        ownerId,
      }),
    ).rejects.toBeInstanceOf(PublishedPageQuotaError);
    expect(mocks.returning).not.toHaveBeenCalled();
    expect(mocks.deleted).not.toHaveBeenCalled();
  });

  it("serializes concurrent publishes of different slugs on the shared owner lock", async () => {
    setQueryRows([], []);
    setQueryRows([], []);
    await Promise.all([
      pgPublishedPageRepository.publish({
        slug: `one-${"1".repeat(24)}`,
        title: "One",
        html: "<p>One</p>",
        ownerId,
      }),
      pgPublishedPageRepository.publish({
        slug: `two-${"2".repeat(24)}`,
        title: "Two",
        html: "<p>Two</p>",
        ownerId,
      }),
    ]);
    const lockSql = mocks.execute.mock.calls.map(([query]) =>
      JSON.stringify(query),
    );
    const ownerLocks = lockSql.filter((query) =>
      query.includes(`published-page-owner:${ownerId}`),
    );
    expect(ownerLocks).toHaveLength(2);
    expect(ownerLocks[0]).toBe(ownerLocks[1]);
    expect(
      lockSql.filter((query) => query.includes("published-page-slug:")),
    ).toHaveLength(2);
  });
});
