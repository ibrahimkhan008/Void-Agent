import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, inserted, selectRows } = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), select: vi.fn() },
  inserted: { options: undefined as unknown, result: [] as unknown[] },
  selectRows: [] as unknown[][],
}));

vi.mock("../db.pg", () => ({ pgDb: dbMock }));

import { pgChatRepository } from "./chat-repository.pg";

describe("chat title repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserted.options = undefined;
    inserted.result = [];
    selectRows.length = 0;
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn((options) => {
        inserted.options = options;
        return insertChain;
      }),
      returning: vi.fn(async () => inserted.result),
    };
    dbMock.insert.mockReturnValue(insertChain);
    dbMock.select.mockImplementation(() => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => selectRows.shift() ?? []),
      };
      return chain;
    });
  });

  it("inserts a missing title and limits conflict writes to an owned blank title", async () => {
    inserted.result = [{ title: "First title" }];
    await expect(
      pgChatRepository.setThreadTitleIfEmpty(
        "thread-1",
        "First title",
        "user-1",
      ),
    ).resolves.toBe("First title");
    const options = inserted.options as {
      setWhere: unknown;
    };
    const where = new PgDialect().sqlToQuery(options.setWhere as never);
    expect(where.sql).toContain('"chat_thread"."user_id" = $1');
    expect(where.sql).toContain('"chat_thread"."title" = $2');
    expect(where.params).toEqual(["user-1", ""]);
  });

  it("returns the already stored title if a replay loses the first-write race", async () => {
    selectRows.push([{ title: "First title" }]);
    await expect(
      pgChatRepository.setThreadTitleIfEmpty(
        "thread-1",
        "Competing title",
        "user-1",
      ),
    ).resolves.toBe("First title");
  });

  it("does not disclose or overwrite a thread owned by another user", async () => {
    await expect(
      pgChatRepository.setThreadTitleIfEmpty(
        "private-thread",
        "Attacker title",
        "attacker",
      ),
    ).resolves.toBeNull();
  });
});
