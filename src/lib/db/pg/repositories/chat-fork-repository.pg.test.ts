import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  txMock,
  selectResults,
  selectCalls,
  insertedValues,
  insertChain,
} = vi.hoisted(() => ({
  dbMock: { transaction: vi.fn() },
  txMock: { select: vi.fn(), insert: vi.fn() },
  selectResults: [] as unknown[][],
  selectCalls: { value: 0 },
  insertedValues: [] as unknown[],
  insertChain: {
    values: vi.fn(),
    returning: vi.fn(),
  },
}));

vi.mock("../db.pg", () => ({ pgDb: dbMock }));

import { pgChatRepository } from "./chat-repository.pg";

const ownerId = "00000000-0000-4000-8000-000000000001";
const sourceThreadId = "00000000-0000-4000-8000-000000000002";
const forkMessageId = "assistant-message-2";

function selectChain(result: unknown[], resolveWhere = false) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi
    .fn()
    .mockImplementation(() => (resolveWhere ? Promise.resolve(result) : chain));
  chain.for = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("chat fork repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    selectCalls.value = 0;
    insertedValues.length = 0;
    dbMock.transaction.mockImplementation(
      (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    txMock.select.mockImplementation(() => {
      const index = selectCalls.value++;
      const result = selectResults.shift() ?? [];
      return selectChain(result, index === 2);
    });
    insertChain.values.mockImplementation((values: unknown) => {
      insertedValues.push(values);
      return insertChain;
    });
    insertChain.returning.mockResolvedValue([
      { id: "fork-thread-id", title: "Project conversation (branch)" },
    ]);
    txMock.insert.mockReturnValue(insertChain);
  });

  it("atomically copies an independent bounded prefix and retains safe thread scope", async () => {
    const sourceThread = {
      id: sourceThreadId,
      title: "Project conversation",
      userId: ownerId,
      orgId: "00000000-0000-4000-8000-000000000003",
      projectId: "00000000-0000-4000-8000-000000000004",
      collectionIds: ["00000000-0000-4000-8000-000000000005"],
      routingModelProvider: "openai",
      routingModel: "gpt-4.1-mini",
    };
    const sourceMessages = [
      {
        id: "user-message-1",
        threadId: sourceThreadId,
        role: "user",
        parts: [{ type: "text", text: "Question" }],
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: forkMessageId,
        threadId: sourceThreadId,
        role: "assistant",
        parts: [{ type: "text", text: "Answer" }],
        metadata: { usage: { totalTokens: 12 }, custom: "kept" },
        createdAt: new Date("2026-01-01T00:00:01Z"),
      },
    ];
    selectResults.push(
      [sourceThread],
      [{ id: forkMessageId }],
      [{ messageCount: 2, contentBytes: 300 }],
      sourceMessages,
    );

    await expect(
      pgChatRepository.forkThread(
        { sourceThreadId, forkFromMessageId: forkMessageId },
        ownerId,
      ),
    ).resolves.toMatchObject({ id: "fork-thread-id" });

    expect(dbMock.transaction).toHaveBeenCalledOnce();
    expect(txMock.insert).toHaveBeenCalledTimes(2);
    expect(insertedValues[0]).toMatchObject({
      userId: ownerId,
      orgId: sourceThread.orgId,
      projectId: sourceThread.projectId,
      collectionIds: sourceThread.collectionIds,
      routingModelProvider: sourceThread.routingModelProvider,
      routingModel: sourceThread.routingModel,
      parentThreadId: sourceThreadId,
      forkFromMessageId: forkMessageId,
    });
    const copiedMessages = insertedValues[1] as Array<Record<string, unknown>>;
    const createdThread = insertedValues[0] as Record<string, unknown>;
    expect(copiedMessages).toHaveLength(2);
    expect(copiedMessages.map((message) => message.id)).not.toContain(
      "user-message-1",
    );
    expect(copiedMessages[1]).toMatchObject({
      threadId: createdThread.id,
      orgId: sourceThread.orgId,
      role: "assistant",
      parts: sourceMessages[1].parts,
      metadata: { custom: "kept", usage: undefined },
    });
  });

  it("rejects an over-limit prefix before writing a branch", async () => {
    selectResults.push(
      [{ id: sourceThreadId, title: "Large chat", userId: ownerId }],
      [{ id: forkMessageId }],
      [{ messageCount: 201, contentBytes: 1024 }],
    );

    await expect(
      pgChatRepository.forkThread(
        { sourceThreadId, forkFromMessageId: forkMessageId },
        ownerId,
      ),
    ).rejects.toThrow("Fork prefix exceeds limits");
    expect(txMock.insert).not.toHaveBeenCalled();
  });
});
