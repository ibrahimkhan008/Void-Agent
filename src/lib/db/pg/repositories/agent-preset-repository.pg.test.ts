import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, predicates } = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), select: vi.fn() },
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: dbMock }));

import {
  createAgentFromPreset,
  seedPresetsForUser,
} from "./agent-repository.pg";

const preset = {
  presetId: "research-agent",
  autoSeed: true,
  category: "Research" as const,
  name: "Research Agent",
  description: "Research with web sources.",
  icon: { type: "emoji" as const, value: "https://cdn.example/search.png" },
  instructions: { role: "Researcher", systemPrompt: "Use sources." },
};

describe("createAgentFromPreset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    predicates.length = 0;
  });

  it("inserts the selected template as a private agent owned by the caller", async () => {
    const chain = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
      returning: vi.fn().mockResolvedValue([{ id: "agent-created" }]),
    };
    chain.values.mockReturnValue(chain);
    chain.onConflictDoNothing.mockReturnValue(chain);
    dbMock.insert.mockReturnValue(chain);

    await expect(createAgentFromPreset("owner-1", preset)).resolves.toEqual({
      agentId: "agent-created",
      created: true,
    });
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        presetId: "research-agent",
        visibility: "private",
      }),
    );
    expect(chain.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("resolves a conflict to only the same owner's existing preset", async () => {
    const insertChain = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
      returning: vi.fn().mockResolvedValue([]),
    };
    insertChain.values.mockReturnValue(insertChain);
    insertChain.onConflictDoNothing.mockReturnValue(insertChain);
    dbMock.insert.mockReturnValue(insertChain);

    const selectChain = {
      from: vi.fn(),
      where: vi.fn((predicate: unknown) => {
        predicates.push(predicate);
        return selectChain;
      }),
      limit: vi.fn().mockResolvedValue([{ id: "agent-existing" }]),
    };
    selectChain.from.mockReturnValue(selectChain);
    dbMock.select.mockReturnValue(selectChain);

    await expect(createAgentFromPreset("owner-1", preset)).resolves.toEqual({
      agentId: "agent-existing",
      created: false,
    });
    const query = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(query.sql).toContain('"agent"."user_id" = $1');
    expect(query.sql).toContain('"agent"."preset_id" = $2');
    expect(query.params).toEqual(["owner-1", "research-agent"]);
  });
});

describe("seedPresetsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds only private preset copies owned by the new user and ignores conflicts", async () => {
    const chain = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    chain.values.mockReturnValue(chain);
    dbMock.insert.mockReturnValue(chain);

    await seedPresetsForUser("new-user", [preset]);

    expect(chain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "new-user",
        presetId: "research-agent",
        visibility: "private",
        name: "Research Agent",
      }),
    ]);
    expect(chain.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("does not issue a database write when there are no auto-seed presets", async () => {
    await seedPresetsForUser("new-user", []);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
