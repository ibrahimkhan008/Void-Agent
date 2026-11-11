import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  dbTransaction: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  returning: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  conflictOptions: undefined as unknown,
  finalizationPredicate: undefined as unknown,
}));

vi.mock("../db.pg", () => ({
  pgDb: {
    insert: mocks.dbInsert,
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
    transaction: mocks.dbTransaction,
  },
}));

import {
  ChatMessageIdCollisionError,
  ChatMessageRunConflictError,
  pgChatRepository,
} from "./chat-repository.pg";

const userMessage = {
  id: "user-message",
  threadId: "thread-one",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "hello" }],
  metadata: { runId: "user-message", runAttemptId: "attempt-one" },
};

describe("chat message lifecycle persistence guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conflictOptions = undefined;
    mocks.finalizationPredicate = undefined;
    const insertBuilder = {
      values: mocks.values,
      onConflictDoUpdate: mocks.onConflictDoUpdate,
      returning: mocks.returning,
    };
    mocks.dbInsert.mockReturnValue(insertBuilder);
    mocks.values.mockReturnValue(insertBuilder);
    mocks.onConflictDoUpdate.mockImplementation((options) => {
      mocks.conflictOptions = options;
      return insertBuilder;
    });
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: mocks.selectWhere,
      limit: mocks.selectLimit,
    };
    mocks.dbSelect.mockReturnValue(selectBuilder);
    mocks.selectWhere.mockReturnValue(selectBuilder);
  });

  it("claims a message once and restricts replay updates to retryable states", async () => {
    const claimed = {
      ...userMessage,
      metadata: { ...userMessage.metadata, runStatus: "running" },
      createdAt: new Date(),
    };
    mocks.returning.mockResolvedValue([claimed]);

    await expect(
      pgChatRepository.claimMessageRun(userMessage),
    ).resolves.toEqual(claimed);

    const options = mocks.conflictOptions as { setWhere: unknown };
    const predicate = new PgDialect().sqlToQuery(options.setWhere as never);
    expect(predicate.sql).toContain('"chat_message"."thread_id" = $1');
    expect(predicate.sql).toContain('"chat_message"."role" = $2');
    expect(predicate.sql).toContain(
      '"chat_message"."metadata"->>\'runStatus\' in',
    );
    expect(predicate.sql).toContain("'false'");
    expect(predicate.params).toEqual([
      "thread-one",
      "user",
      "failed",
      "incomplete",
      "cancelled",
      "timed_out",
    ]);
  });

  it("rejects a duplicate active/completed request without rewriting it", async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.selectLimit.mockResolvedValue([{ threadId: "thread-one" }]);

    await expect(
      pgChatRepository.claimMessageRun(userMessage),
    ).rejects.toBeInstanceOf(ChatMessageRunConflictError);
  });

  it("rejects a message ID already owned by another thread", async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.selectLimit.mockResolvedValue([{ threadId: "thread-two" }]);

    await expect(
      pgChatRepository.claimMessageRun(userMessage),
    ).rejects.toBeInstanceOf(ChatMessageIdCollisionError);
  });

  it("scopes ordinary upsert conflicts to the same thread and role", async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(
      pgChatRepository.upsertMessage(userMessage),
    ).rejects.toBeInstanceOf(ChatMessageIdCollisionError);

    const options = mocks.conflictOptions as { setWhere: unknown };
    const predicate = new PgDialect().sqlToQuery(options.setWhere as never);
    expect(predicate.sql).toContain('"chat_message"."thread_id" = $1');
    expect(predicate.sql).toContain('"chat_message"."role" = $2');
    expect(predicate.params).toEqual(["thread-one", "user"]);
  });

  it("finalizes the user attempt and assistant output in one transaction", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: userMessage.id }]);
    const updateWhere = vi.fn((predicate: unknown) => {
      mocks.finalizationPredicate = predicate;
      return { returning: updateReturning };
    });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: updateSet });
    const insertReturning = vi
      .fn()
      .mockResolvedValue([{ id: "assistant-one" }]);
    const insertConflict = vi
      .fn()
      .mockReturnValue({ returning: insertReturning });
    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: insertConflict,
    });
    const txInsert = vi.fn().mockReturnValue({ values: insertValues });
    mocks.dbTransaction.mockImplementation(async (callback) =>
      callback({ update: txUpdate, insert: txInsert }),
    );

    await expect(
      pgChatRepository.finalizeMessageRun(
        {
          ...userMessage,
          metadata: {
            ...userMessage.metadata,
            runStatus: "completed",
          },
        },
        {
          id: "assistant-one",
          threadId: "thread-one",
          role: "assistant",
          parts: [{ type: "text", text: "hi" }],
        },
      ),
    ).resolves.toBeUndefined();

    expect(mocks.dbTransaction).toHaveBeenCalledOnce();
    expect(updateReturning).toHaveBeenCalledOnce();
    expect(insertReturning).toHaveBeenCalledOnce();
    const predicate = new PgDialect().sqlToQuery(
      mocks.finalizationPredicate as never,
    );
    expect(predicate.sql).toContain(
      '"chat_message"."metadata"->>\'runAttemptId\' = $4',
    );
    expect(predicate.sql).toContain(
      '"chat_message"."metadata"->>\'runStatus\' = $5',
    );
    expect(predicate.params).toEqual([
      "user-message",
      "thread-one",
      "user",
      "attempt-one",
      "running",
    ]);
  });

  it("inserts the first thread and user message inside one transaction", async () => {
    const threadRow = {
      id: "thread-one",
      title: "",
      userId: "owner-one",
      projectId: null,
      knowledgeBases: [],
      createdAt: new Date(),
    };
    const threadReturning = vi.fn().mockResolvedValue([threadRow]);
    const messageReturning = vi
      .fn()
      .mockResolvedValue([{ id: userMessage.id }]);
    const threadValues = vi
      .fn()
      .mockReturnValue({ returning: threadReturning });
    const messageValues = vi.fn().mockReturnValue({
      returning: messageReturning,
    });
    const txInsert = vi
      .fn()
      .mockReturnValueOnce({ values: threadValues })
      .mockReturnValueOnce({ values: messageValues });
    mocks.dbTransaction.mockImplementation(async (callback) =>
      callback({ insert: txInsert }),
    );

    await expect(
      pgChatRepository.insertThreadWithFirstMessage(
        {
          id: "thread-one",
          title: "",
          userId: "owner-one",
        },
        userMessage,
      ),
    ).resolves.toMatchObject({ id: "thread-one", userId: "owner-one" });

    expect(mocks.dbTransaction).toHaveBeenCalledOnce();
    expect(txInsert).toHaveBeenCalledTimes(2);
    expect(messageValues).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-one",
        metadata: expect.objectContaining({
          runStatus: "failed",
          error: { code: "not_started", retryable: true },
        }),
      }),
    );
  });

  it("does not swallow initial-message persistence failure inside the transaction", async () => {
    const threadReturning = vi.fn().mockResolvedValue([
      {
        id: "thread-one",
        title: "",
        userId: "owner-one",
        projectId: null,
        knowledgeBases: [],
        createdAt: new Date(),
      },
    ]);
    const messageReturning = vi.fn().mockRejectedValue(new Error("db failure"));
    const txInsert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: threadReturning }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: messageReturning }),
      });
    mocks.dbTransaction.mockImplementation(async (callback) =>
      callback({ insert: txInsert }),
    );

    await expect(
      pgChatRepository.insertThreadWithFirstMessage(
        { id: "thread-one", title: "", userId: "owner-one" },
        userMessage,
      ),
    ).rejects.toThrow("db failure");
    expect(mocks.dbTransaction).toHaveBeenCalledOnce();
    expect(txInsert).toHaveBeenCalledTimes(2);
  });
});
