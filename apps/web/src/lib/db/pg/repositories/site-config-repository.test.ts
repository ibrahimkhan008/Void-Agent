import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const insertChain = { values: vi.fn(), onConflictDoUpdate: vi.fn() };
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  const db = {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => selectChain),
  };
  const drizzle = {
    desc: vi.fn((column: unknown) => ({ op: "desc", column })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: "eq", left, right })),
  };
  return { db, insertChain, selectChain, drizzle };
});

vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("../schema.pg", () => ({
  SiteConfigTable: { key: { name: "key" } },
  SiteConfigAuditTable: { changedAt: { name: "changed_at" } },
}));

import { SiteConfigAuditTable, SiteConfigTable } from "../schema.pg";
import { siteConfigRepository } from "./site-config-repository.pg";

describe("siteConfigRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockResolvedValue([]);
  });

  it("loads keyed configuration and returns null when missing", async () => {
    const settings = { dynamicProviders: { custom: { enabled: true } } };
    mocks.selectChain.limit.mockResolvedValueOnce([
      { key: "models", settings },
    ]);
    expect(await siteConfigRepository.getConfig("models")).toEqual(settings);
    expect(mocks.selectChain.from).toHaveBeenCalledWith(SiteConfigTable);
    expect(mocks.selectChain.where).toHaveBeenCalledWith({
      op: "eq",
      left: SiteConfigTable.key,
      right: "models",
    });

    mocks.selectChain.limit.mockResolvedValueOnce([]);
    expect(await siteConfigRepository.getConfig("missing")).toBeNull();
  });

  it("upserts settings and writes an audit row for a known user", async () => {
    const settings = { defaultModel: "provider/model" };
    await siteConfigRepository.upsert(
      "models",
      settings,
      "user-uuid",
      "create",
    );

    expect(mocks.db.insert).toHaveBeenNthCalledWith(1, SiteConfigTable);
    expect(mocks.insertChain.values).toHaveBeenNthCalledWith(1, {
      key: "models",
      settings,
    });
    expect(mocks.insertChain.onConflictDoUpdate).toHaveBeenCalledWith({
      target: SiteConfigTable.key,
      set: { settings },
    });
    expect(mocks.db.insert).toHaveBeenNthCalledWith(2, SiteConfigAuditTable);
    expect(mocks.insertChain.values).toHaveBeenNthCalledWith(2, {
      key: "models",
      settings,
      changedBy: "user-uuid",
      changeType: "create",
    });
  });

  it("does not write an audit row for absent or unknown user identity", async () => {
    await siteConfigRepository.upsert("tools", { enabled: true });
    await siteConfigRepository.upsert("tools", { enabled: false }, "unknown");
    expect(mocks.db.insert).toHaveBeenCalledTimes(2);
  });

  it("loads all config and newest audit entries with the requested limit", async () => {
    const rows = [
      { key: "models", settings: { defaultModel: "one" } },
      { key: "tools", settings: { enabled: true } },
    ];
    mocks.selectChain.from.mockResolvedValueOnce(rows);
    expect(await siteConfigRepository.getAll()).toEqual({
      models: rows[0].settings,
      tools: rows[1].settings,
    });
    expect(mocks.selectChain.from).toHaveBeenCalledWith(SiteConfigTable);

    const audit = [{ key: "models", changedBy: "user-uuid" }];
    mocks.selectChain.limit.mockResolvedValueOnce(audit);
    expect(await siteConfigRepository.getAuditLog(10)).toEqual(audit);
    expect(mocks.selectChain.from).toHaveBeenLastCalledWith(
      SiteConfigAuditTable,
    );
    expect(mocks.drizzle.desc).toHaveBeenCalledWith(
      SiteConfigAuditTable.changedAt,
    );
    expect(mocks.selectChain.limit).toHaveBeenLastCalledWith(10);
  });
});
