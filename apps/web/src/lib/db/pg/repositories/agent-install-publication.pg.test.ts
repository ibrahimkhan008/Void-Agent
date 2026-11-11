import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  predicates: [] as unknown[],
  values: [] as unknown[],
  returningRows: [] as unknown[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({
  pgDb: { select: mocks.select, update: mocks.update },
}));

import { agentInstallRepository } from "./agent-install-repository.pg";

function query(sqlPredicate: unknown) {
  return new PgDialect().sqlToQuery(sqlPredicate as never);
}

describe("agent gallery publication persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.predicates.length = 0;
    mocks.values.length = 0;
    mocks.returningRows.length = 0;

    const selectChain = {
      from: vi.fn(),
      where: vi.fn((predicate: unknown) => {
        mocks.predicates.push(predicate);
        return selectChain;
      }),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      then: (
        resolve: (rows: unknown[]) => unknown,
        reject: (error: unknown) => unknown,
      ) =>
        Promise.resolve(mocks.returningRows.shift() ?? []).then(
          resolve,
          reject,
        ),
    };
    selectChain.from.mockReturnValue(selectChain);
    selectChain.orderBy.mockReturnValue(selectChain);
    selectChain.limit.mockReturnValue(selectChain);
    selectChain.offset.mockImplementation(() =>
      Promise.resolve(mocks.returningRows.shift() ?? []),
    );
    selectChain.where.mockImplementation((predicate: unknown) => {
      mocks.predicates.push(predicate);
      return selectChain;
    });
    mocks.select.mockReturnValue(selectChain);

    const updateChain = {
      set: vi.fn((value: unknown) => {
        mocks.values.push(value);
        return updateChain;
      }),
      where: vi.fn((predicate: unknown) => {
        mocks.predicates.push(predicate);
        return updateChain;
      }),
      returning: vi.fn(() =>
        Promise.resolve(mocks.returningRows.shift() ?? []),
      ),
    };
    mocks.update.mockReturnValue(updateChain);
  });

  it("makes the publication write owner-scoped and race-safe against private visibility", async () => {
    mocks.returningRows.push([
      { publishedAt: new Date("2026-11-08T12:00:00Z"), visibility: "public" },
    ]);
    await expect(
      agentInstallRepository.publishAgent("owner-1", "agent-1"),
    ).resolves.toMatchObject({ visibility: "public" });

    const predicate = query(mocks.predicates.at(-1));
    expect(predicate.sql).toContain('"agent"."id" = $');
    expect(predicate.sql).toContain('"agent"."user_id" = $');
    expect(predicate.sql).toContain('"agent"."visibility" in');
    expect(predicate.params).toEqual([
      "agent-1",
      "owner-1",
      "public",
      "readonly",
    ]);
    expect(
      query((mocks.values[0] as Record<string, unknown>).publishedAt).sql,
    ).toContain("COALESCE");
  });

  it("scopes publication status reads to the owner", async () => {
    mocks.returningRows.push([{ publishedAt: null, visibility: "private" }]);
    await agentInstallRepository.getAgentPublicationStatus(
      "owner-1",
      "agent-1",
    );
    const predicate = query(mocks.predicates.at(-1));
    expect(predicate.sql).toContain('"agent"."id" = $');
    expect(predicate.sql).toContain('"agent"."user_id" = $');
    expect(predicate.params).toEqual(["agent-1", "owner-1"]);
  });

  it("omits private agents from public browse, detail, and search queries", async () => {
    mocks.returningRows.push([], [], []);
    await agentInstallRepository.listPublishedAgents();
    await agentInstallRepository.getPublishedAgent("agent-1");
    await agentInstallRepository.searchPublishedAgents("query");

    for (const predicate of mocks.predicates) {
      const compiled = query(predicate);
      expect(compiled.sql).toContain('"agent"."published_at" is not null');
      expect(compiled.sql).toContain('"agent"."visibility" in');
      expect(compiled.params).toContain("public");
      expect(compiled.params).toContain("readonly");
    }
  });

  it("clears publication with an owner-scoped unpublish update", async () => {
    mocks.returningRows.push([{ id: "agent-1" }]);
    await expect(
      agentInstallRepository.unpublishAgent("owner-1", "agent-1"),
    ).resolves.toBe(true);
    const predicate = query(mocks.predicates.at(-1));
    expect(predicate.params).toEqual(["agent-1", "owner-1"]);
    expect(mocks.values[0]).toMatchObject({ publishedAt: null });
  });
});
