import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  tx: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  getProjectAccess: vi.fn(),
  mayEditProject: vi.fn(),
  rateLimit: vi.fn(),
  scheduleQueueTick: vi.fn(),
  sourceValues: null as null | Record<string, unknown>,
  versionValues: null as null | Record<string, unknown>,
  runValues: null as null | Record<string, unknown>,
  selectedTables: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./brain-queue", () => ({
  scheduleProjectBrainQueueTick: mocks.scheduleQueueTick,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: mocks.mayEditProject,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import {
  ChatMessageTable,
  ChatThreadTable,
  ProjectBrainChatSourceTable,
  ProjectBrainRunTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import { refreshProjectBrainChatSource } from "./project-chat-brain-source";

type TestBuilder = Record<string, (...args: never[]) => unknown>;

const projectId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const sourceId = "00000000-0000-4000-8000-000000000003";
const versionId = "00000000-0000-4000-8000-000000000004";
const runId = "00000000-0000-4000-8000-000000000005";
const transcript = "User: Who owns Launch?\n\nAssistant: Riya owns Launch.";

function query(rows: unknown[]) {
  const builder: TestBuilder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    for: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

function insertBuilder(table: unknown) {
  const builder: TestBuilder = {
    values: (input: Record<string, unknown>) => {
      if (table === ProjectBrainChatSourceTable) mocks.sourceValues = input;
      if (table === ProjectBrainSourceVersionTable) mocks.versionValues = input;
      if (table === ProjectBrainRunTable) mocks.runValues = input;
      return builder;
    },
    onConflictDoNothing: () => builder,
    returning: () => {
      if (table === ProjectBrainChatSourceTable) {
        return Promise.resolve([{ id: sourceId }]);
      }
      if (table === ProjectBrainSourceVersionTable) {
        return Promise.resolve([{ id: versionId }]);
      }
      if (table === ProjectBrainRunTable) {
        return Promise.resolve([{ id: runId }]);
      }
      return Promise.resolve([]);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sourceValues = null;
  mocks.versionValues = null;
  mocks.runValues = null;
  mocks.selectedTables = [];
  mocks.getProjectAccess.mockResolvedValue({ role: "owner" });
  mocks.mayEditProject.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      mocks.selectedTables.push(table);
      if (table === ChatThreadTable) {
        return query([{ id: threadId, userId: "owner-1", projectId }]);
      }
      if (table === ChatMessageTable) {
        return query([
          {
            role: "assistant",
            parts: [{ type: "text", text: "Riya owns Launch." }],
            metadata: { runStatus: "completed" },
          },
          {
            role: "user",
            parts: [
              { type: "text", text: "Who owns Launch?" },
              { type: "file", filename: "private.pdf" },
            ],
            metadata: null,
          },
        ]);
      }
      return query([]);
    },
  }));
  mocks.tx.select.mockImplementation(() => ({
    from: (table: unknown) => {
      mocks.selectedTables.push(table);
      return query([]);
    },
  }));
  mocks.tx.insert.mockImplementation((table: unknown) => insertBuilder(table));
  mocks.tx.update.mockImplementation(() => {
    const builder: TestBuilder = {
      set: () => builder,
      where: () => builder,
    };
    return builder;
  });
  mocks.tx.delete.mockImplementation(() => ({
    where: () => Promise.resolve([]),
  }));
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
      callback(mocks.tx),
  );
});

describe("completed project chat source lifecycle", () => {
  it("creates an active owner-bound source, snapshot, and queued extraction run", async () => {
    const result = await refreshProjectBrainChatSource({
      threadId,
      userId: "owner-1",
      forceEnqueue: true,
    });
    const fingerprint = projectBrainSourceFingerprint(
      `chat:${threadId}`,
      transcript,
    );

    expect(result).toEqual({ queued: true, reason: "queued" });
    expect(mocks.scheduleQueueTick).toHaveBeenCalledWith(runId);
    expect(mocks.sourceValues).toMatchObject({
      projectId,
      threadId,
      ownerUserId: "owner-1",
      activeFingerprint: fingerprint,
    });
    expect(mocks.versionValues).toMatchObject({
      projectId,
      sourceType: "chat",
      sourceItemId: null,
      chatSourceId: sourceId,
      sourceFingerprint: fingerprint,
      contentSnapshot: transcript,
      contentLength: transcript.length,
    });
    expect(mocks.runValues).toMatchObject({
      projectId,
      requestedByUserId: "owner-1",
      sourceType: "chat",
      chatSourceId: sourceId,
      sourceVersionId: versionId,
      sourceFingerprint: fingerprint,
      status: "queued",
    });
    expect(mocks.versionValues?.contentSnapshot).not.toContain("private.pdf");
  });

  it("does not capture a chat when its owner lacks project edit access", async () => {
    mocks.mayEditProject.mockReturnValue(false);

    const result = await refreshProjectBrainChatSource({
      threadId,
      userId: "owner-1",
      forceEnqueue: true,
    });

    expect(result).toEqual({
      queued: false,
      reason: "project-access-unavailable",
    });
    expect(mocks.selectedTables).toContain(ChatThreadTable);
    expect(mocks.selectedTables).not.toContain(ChatMessageTable);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.scheduleQueueTick).not.toHaveBeenCalled();
  });
});
