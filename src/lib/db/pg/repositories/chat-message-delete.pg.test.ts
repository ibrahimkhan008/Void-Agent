import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  returning: vi.fn(),
  rows: [] as { id: string }[],
  predicate: undefined as unknown,
}));

vi.mock("../db.pg", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    pgDb: {
      select: (fields: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: (predicate: unknown) => ({
            getSQL: () =>
              sql.join(
                [
                  sql.raw("select "),
                  fields.id as never,
                  sql.raw(" from "),
                  table as never,
                  sql.raw(" where "),
                  predicate as never,
                ],
                sql.empty(),
              ),
          }),
        }),
      }),
      delete: vi.fn(() => ({
        where: (predicate: unknown) => {
          mocks.predicate = predicate;
          mocks.where(predicate);
          return { returning: mocks.returning };
        },
      })),
    },
  };
});

import { pgChatRepository } from "./chat-repository.pg";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "message-1";

function queryCapturedPredicate() {
  if (!mocks.predicate)
    throw new Error("Expected delete predicate to be built");
  return new PgDialect().sqlToQuery(mocks.predicate as never);
}

describe("chat message delete SQL ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: MESSAGE_ID }];
    mocks.returning.mockImplementation(() => mocks.rows);
  });

  it("atomically scopes one-message deletion to a thread owned by the caller", async () => {
    await expect(
      pgChatRepository.deleteChatMessage(MESSAGE_ID, USER_ID),
    ).resolves.toBe(true);

    const query = queryCapturedPredicate();
    expect(query.sql).toContain('"chat_thread"."user_id"');
    expect(query.sql).toContain('"chat_message"."id"');
    expect(query.params).toContain(USER_ID);
    expect(query.params).toContain(MESSAGE_ID);
  });

  it("scopes truncation to the owner's thread and a stable timestamp/id cursor", async () => {
    await expect(
      pgChatRepository.deleteMessagesByChatIdAfterTimestamp(
        MESSAGE_ID,
        USER_ID,
      ),
    ).resolves.toBe(true);

    const query = queryCapturedPredicate();
    expect(query.sql).toContain('"chat_thread"."user_id"');
    expect(query.sql).toContain('"chat_message"."created_at" >');
    expect(query.sql).toContain('"chat_message"."created_at" =');
    expect(query.sql).toContain('"chat_message"."id" >=');
    expect(query.params).toContain(USER_ID);
    expect(
      query.params.filter((value) => value === MESSAGE_ID).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("reports a no-op when the scoped DELETE returns no rows", async () => {
    mocks.rows = [];
    mocks.returning.mockImplementation(() => mocks.rows);

    await expect(
      pgChatRepository.deleteChatMessage(MESSAGE_ID, USER_ID),
    ).resolves.toBe(false);
  });
});
