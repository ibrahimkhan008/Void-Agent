import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  selectedRows: [] as unknown[][],
  inserted: [] as Array<{ table: unknown; value: Record<string, unknown> }>,
  updated: [] as Array<Record<string, unknown>>,
  insertRows: [] as unknown[][],
  updateRows: [] as unknown[][],
  forUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { FileCleanupOutboxTable, ProjectDocumentEditTable } from "../schema.pg";
import { projectDocumentEditRepository } from "./project-document-edit-repository.pg";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const projectDocumentId = "00000000-0000-4000-8000-000000000003";
const editId = "00000000-0000-4000-8000-000000000004";
const hash = "a".repeat(64);
const candidateStorageKey = `uploads/${userId}/candidate.docx`;
const outputStorageKey = `uploads/${userId}/accepted.docx`;
const trackedChanges = [
  {
    id: "00000000-0000-4000-8000-000000000005",
    delId: "12",
    insId: "13",
  },
];
const proposals = [
  { originalText: "Old", suggestedText: "New", rationale: "Clarify" },
];

function makeQuery(rows: unknown[]) {
  const query: Record<string, any> = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    for: vi.fn((mode: string) => {
      if (mode === "update") mocks.forUpdate();
      return query;
    }),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

const tx = {
  select: vi.fn(() => makeQuery(mocks.selectedRows.shift() ?? [])),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn((value: Record<string, unknown>) => {
      mocks.inserted.push({ table, value });
      return {
        returning: vi.fn(async () => mocks.insertRows.shift() ?? [value]),
      };
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn((value: Record<string, unknown>) => {
      mocks.updated.push(value);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => mocks.updateRows.shift() ?? []),
        })),
      };
    }),
  })),
};

vi.mock("../db.pg", () => ({
  pgDb: {
    transaction: mocks.transaction,
  },
}));

const pendingRow = (overrides: Record<string, unknown> = {}) => ({
  id: editId,
  projectId,
  projectDocumentId,
  createdByUserId: userId,
  sourceRevisionHash: hash,
  proposedEdits: proposals,
  trackedChanges,
  candidateStorageKey,
  outputStorageKey: null,
  status: "pending",
  resolvedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectedRows.length = 0;
  mocks.inserted.length = 0;
  mocks.updated.length = 0;
  mocks.insertRows.length = 0;
  mocks.updateRows.length = 0;
  mocks.transaction.mockImplementation(async (callback) =>
    callback(tx as never),
  );
});

describe("projectDocumentEditRepository", () => {
  it("validates project linkage and stores bounded owner-private candidate data", async () => {
    mocks.selectedRows.push([{ id: projectDocumentId }]);
    const inserted = {
      id: editId,
      ...{
        projectId,
        projectDocumentId,
        createdByUserId: userId,
        sourceRevisionHash: hash,
        candidateStorageKey,
        proposedEdits: proposals,
        trackedChanges,
        status: "pending",
      },
    };
    mocks.insertRows.push([inserted]);
    await expect(
      projectDocumentEditRepository.createPending({
        projectId,
        projectDocumentId,
        createdByUserId: userId,
        sourceRevisionHash: hash,
        candidateStorageKey,
        proposedEdits: proposals,
        trackedChanges,
      }),
    ).resolves.toMatchObject({ status: "pending", candidateStorageKey });
    expect(mocks.inserted[0]?.table).toBe(ProjectDocumentEditTable);
    expect(mocks.inserted[0]?.value).toMatchObject({
      projectId,
      projectDocumentId,
      createdByUserId: userId,
      sourceRevisionHash: hash,
      candidateStorageKey,
      proposedEdits: proposals,
      trackedChanges,
    });
  });

  it("refuses cross-project documents and invalid or foreign private keys", async () => {
    mocks.selectedRows.push([]);
    await expect(
      projectDocumentEditRepository.createPending({
        projectId,
        projectDocumentId,
        createdByUserId: userId,
        sourceRevisionHash: hash,
        candidateStorageKey,
        proposedEdits: proposals,
        trackedChanges,
      }),
    ).rejects.toThrow("Project document is unavailable");
    await expect(
      projectDocumentEditRepository.createPending({
        projectId,
        projectDocumentId,
        createdByUserId: userId,
        sourceRevisionHash: hash,
        candidateStorageKey: "https://storage.test/candidate.docx",
        proposedEdits: proposals,
        trackedChanges,
      }),
    ).rejects.toThrow("Invalid private project document candidate key");
    await expect(
      projectDocumentEditRepository.createPending({
        projectId,
        projectDocumentId,
        createdByUserId: userId,
        sourceRevisionHash: "not-a-sha256",
        candidateStorageKey,
        proposedEdits: proposals,
        trackedChanges,
      }),
    ).rejects.toThrow("Invalid project document source revision hash");
    expect(mocks.inserted).toHaveLength(0);
  });

  it("accepts one pending edit and queues a distinct tracked candidate for cleanup", async () => {
    mocks.selectedRows.push([pendingRow()]);
    const accepted = pendingRow({
      status: "accepted",
      candidateStorageKey: null,
      outputStorageKey,
      resolvedAt: new Date(),
    });
    mocks.updateRows.push([accepted]);
    await expect(
      projectDocumentEditRepository.resolvePending({
        id: editId,
        projectId,
        currentSourceRevisionHash: hash,
        decision: "accepted",
        outputStorageKey,
      }),
    ).resolves.toMatchObject({ outcome: "resolved", edit: accepted });
    expect(mocks.forUpdate).toHaveBeenCalledOnce();
    expect(mocks.inserted).toContainEqual({
      table: FileCleanupOutboxTable,
      value: { userId, storageKey: candidateStorageKey },
    });
    expect(mocks.updated[0]).toMatchObject({
      status: "accepted",
      candidateStorageKey: null,
      outputStorageKey,
    });
  });

  it("rejects by atomically queueing the candidate and clearing its key", async () => {
    mocks.selectedRows.push([pendingRow()]);
    mocks.updateRows.push([pendingRow({ status: "rejected" })]);
    await expect(
      projectDocumentEditRepository.resolvePending({
        id: editId,
        projectId,
        currentSourceRevisionHash: hash,
        decision: "rejected",
      }),
    ).resolves.toMatchObject({ outcome: "resolved" });
    expect(mocks.inserted).toContainEqual({
      table: FileCleanupOutboxTable,
      value: { userId, storageKey: candidateStorageKey },
    });
    expect(mocks.updated[0]).toMatchObject({
      status: "rejected",
      candidateStorageKey: null,
      outputStorageKey: null,
    });
  });

  it("marks source-changed edits stale and cleans candidate plus generated output", async () => {
    mocks.selectedRows.push([pendingRow()]);
    mocks.updateRows.push([pendingRow({ status: "stale" })]);
    await expect(
      projectDocumentEditRepository.resolvePending({
        id: editId,
        projectId,
        currentSourceRevisionHash: "b".repeat(64),
        decision: "accepted",
        outputStorageKey,
      }),
    ).resolves.toEqual({ outcome: "stale" });
    expect(
      mocks.inserted
        .filter((item) => item.table === FileCleanupOutboxTable)
        .map((item) => item.value.storageKey),
    ).toEqual([candidateStorageKey, outputStorageKey]);
    expect(mocks.updated[0]).toMatchObject({
      status: "stale",
      candidateStorageKey: null,
      outputStorageKey: null,
    });
  });

  it("prevents re-resolution and requires a downloadable private acceptance", async () => {
    mocks.selectedRows.push([pendingRow({ status: "rejected" })]);
    await expect(
      projectDocumentEditRepository.resolvePending({
        id: editId,
        projectId,
        currentSourceRevisionHash: hash,
        decision: "rejected",
      }),
    ).resolves.toEqual({ outcome: "conflict" });
    await expect(
      projectDocumentEditRepository.resolvePending({
        id: editId,
        projectId,
        currentSourceRevisionHash: hash,
        decision: "accepted",
      }),
    ).rejects.toThrow("Accepted edits require a private output file");
    expect(mocks.updated).toHaveLength(0);
  });
});
