import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, txMock, whereClauses, insertValues } = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
  txMock: { select: vi.fn(), insert: vi.fn() },
  whereClauses: [] as unknown[],
  insertValues: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: dbMock }));

import { clonePublishedAgentForUser } from "./agent-clone-repository.pg";

const sourceId = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";

function selectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn((condition: unknown) => {
    whereClauses.push(condition);
    return chain;
  });
  chain.for = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("clonePublishedAgentForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereClauses.length = 0;
    dbMock.transaction.mockImplementation(
      (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
  });

  it("copies only safe published prompt fields into a private owner-scoped agent", async () => {
    const source = {
      id: sourceId,
      name: "Published helper",
      description: "Safe published description",
      icon: { type: "emoji", value: "🤖", style: { color: "red" } },
      instructions: {
        role: "Research helper",
        systemPrompt: "Be accurate.",
        model: "secret-provider/model-pin",
        mentions: [{ type: "mcpTool", serverId: "publisher-server" }],
        files: [{ storageKey: "users/publisher/private.txt" }],
      },
    };
    txMock.select.mockReturnValueOnce(selectChain([source]));
    const insertChain = {
      values: insertValues,
      onConflictDoNothing: vi.fn(),
      returning: vi.fn().mockResolvedValue([{ id: "copy-id" }]),
    };
    insertValues.mockReturnValue(insertChain);
    insertChain.onConflictDoNothing.mockReturnValue(insertChain);
    txMock.insert.mockReturnValue(insertChain);

    await expect(
      clonePublishedAgentForUser(sourceId, ownerId),
    ).resolves.toEqual({ agentId: "copy-id", created: true });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ownerId,
        presetId: `gallery-copy:${sourceId}`,
        name: "Published helper (Copy)",
        description: "Safe published description",
        icon: { type: "emoji", value: "🤖" },
        instructions: {
          role: "Research helper",
          systemPrompt: "Be accurate.",
        },
        visibility: "private",
        publishedAt: null,
        installCount: 0,
        galleryMetadata: null,
        coverImageUrl: null,
      }),
    );
    const sourcePredicate = new PgDialect().sqlToQuery(
      whereClauses[0] as never,
    );
    expect(sourcePredicate.sql).toContain('"agent"."published_at" is not null');
    expect(sourcePredicate.sql).toContain('"agent"."visibility" in');
    expect(sourcePredicate.params).toContain(sourceId);
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("does not create a clone when publication is absent", async () => {
    txMock.select.mockReturnValueOnce(selectChain([]));
    await expect(
      clonePublishedAgentForUser(sourceId, ownerId),
    ).resolves.toBeNull();
    expect(txMock.insert).not.toHaveBeenCalled();
  });

  it("resolves duplicate requests only to the same user's existing clone", async () => {
    txMock.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: sourceId,
            name: "Shared",
            description: null,
            icon: null,
            instructions: {},
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([{ id: "existing-copy" }]));
    const insertChain = {
      values: insertValues,
      onConflictDoNothing: vi.fn(),
      returning: vi.fn().mockResolvedValue([]),
    };
    insertValues.mockReturnValue(insertChain);
    insertChain.onConflictDoNothing.mockReturnValue(insertChain);
    txMock.insert.mockReturnValue(insertChain);

    await expect(
      clonePublishedAgentForUser(sourceId, ownerId),
    ).resolves.toEqual({ agentId: "existing-copy", created: false });
    const clonePredicate = new PgDialect().sqlToQuery(whereClauses[1] as never);
    expect(clonePredicate.params).toEqual([
      ownerId,
      `gallery-copy:${sourceId}`,
    ]);
  });
});
