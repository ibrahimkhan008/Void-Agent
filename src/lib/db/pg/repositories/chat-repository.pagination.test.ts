import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, responses, predicates } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  responses: [] as unknown[][],
  predicates: [] as unknown[],
}));

vi.mock("../db.pg", () => ({ pgDb: { select: selectMock } }));

import { pgChatRepository } from "./chat-repository.pg";

function queueSelectRows(...rowsByQuery: unknown[][]) {
  responses.splice(0, responses.length, ...rowsByQuery);
  selectMock.mockImplementation(() => {
    const rows = responses.shift() ?? [];
    const query = {
      from: () => query,
      where: (predicate: unknown) => {
        predicates.push(predicate);
        return query;
      },
      orderBy: () => query,
      limit: () => Promise.resolve(rows),
    };
    return query;
  });
}

describe("chat history pagination", () => {
  beforeEach(() => {
    selectMock.mockReset();
    responses.length = 0;
    predicates.length = 0;
  });

  it("returns a cursor page in chronological order", async () => {
    const older = {
      id: "older",
      threadId: "thread-1",
      role: "user",
      parts: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const newer = {
      ...older,
      id: "newer",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    queueSelectRows([newer, older]);

    const page = await pgChatRepository.selectMessagesByThreadId("thread-1", {
      limit: 50,
      beforeMessageId: "cursor",
    });

    expect(page.map((message) => message.id)).toEqual(["older", "newer"]);
    expect(selectMock).toHaveBeenCalledTimes(1);
    const whereClause = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(whereClause.sql).toContain('"chat_message"."thread_id" = $1');
    expect(whereClause.sql).toContain(
      'select "chat_message"."created_at" from "chat_message"',
    );
    expect(whereClause.params).toContain("cursor");
    expect(whereClause.params).toContain("thread-1");
  });

  it("returns an empty page when the cursor query yields no rows", async () => {
    queueSelectRows([]);

    const page = await pgChatRepository.selectMessagesByThreadId("thread-1", {
      limit: 50,
      beforeMessageId: "foreign-cursor",
    });

    expect(page).toEqual([]);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("uses the message ID as a deterministic boundary for tied timestamps", async () => {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    const pageRows = [
      {
        id: "a-message",
        threadId: "thread-1",
        role: "user",
        parts: [],
        createdAt: timestamp,
      },
      {
        id: "b-message",
        threadId: "thread-1",
        role: "assistant",
        parts: [],
        createdAt: timestamp,
      },
    ];
    queueSelectRows(pageRows);

    await pgChatRepository.selectMessagesByThreadId("thread-1", {
      limit: 50,
      beforeMessageId: "c-cursor",
    });

    const whereClause = new PgDialect().sqlToQuery(predicates[0] as never);
    expect(whereClause.sql).toContain('"chat_message"."created_at" <');
    expect(whereClause.sql).toContain(
      '"chat_message"."created_at" = (select "chat_message"."created_at"',
    );
    expect(whereClause.sql).toContain('"chat_message"."id" < $');
    expect(whereClause.params).toContain("c-cursor");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page size %s without querying the database",
    async (limit) => {
      const page = await pgChatRepository.selectMessagesByThreadId("thread-1", {
        limit,
      });

      expect(page).toEqual([]);
      expect(selectMock).not.toHaveBeenCalled();
    },
  );
});
