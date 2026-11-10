import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  tx: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  mayEditProject: vi.fn(),
  runInference: vi.fn(),
  generateObject: vi.fn(),
  notify: vi.fn(),
  after: vi.fn(),
  maintenance: vi.fn(),
  rateLimit: vi.fn(),
  insertedFacts: [] as Array<Record<string, unknown>>,
  insertedPages: [] as Array<Record<string, unknown>>,
  selectedTables: [] as unknown[],
  source: null as null | Record<string, unknown>,
  claimTransactionCount: 0,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    transaction: mocks.transaction,
  },
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelAsync: vi.fn().mockResolvedValue({}),
    getModelWithFailureFallbackAsync: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: mocks.mayEditProject,
}));
vi.mock("lib/projects/project-brain-budgeted-inference", () => ({
  runProjectBrainBudgetedInference: mocks.runInference,
}));
vi.mock("lib/notifications/project-brain-run-completed", () => ({
  notifyProjectBrainRunCompleted: mocks.notify,
}));
vi.mock("lib/projects/brain-maintenance", () => ({
  runProjectBrainMaintenance: mocks.maintenance,
}));
vi.mock("lib/projects/recompute-brain-salience", () => ({
  recomputeProjectBrainSalience: vi.fn(),
}));
vi.mock("lib/projects/brain-page-archive", () => ({
  archiveStaleProjectBrainPage: vi.fn(),
  listStaleProjectBrainPages: vi.fn(),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import {
  ChatMessageTable,
  ProjectBrainChatSourceTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
  ProjectBrainRunTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import {
  processProjectBrainQueue,
  scheduleProjectBrainQueueTick,
} from "./brain-queue";

type TestBuilder = Record<string, (...args: never[]) => unknown>;

const projectId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const sourceId = "00000000-0000-4000-8000-000000000003";
const versionId = "00000000-0000-4000-8000-000000000004";
const runId = "00000000-0000-4000-8000-000000000005";
const pageId = "00000000-0000-4000-8000-000000000006";
const factId = "00000000-0000-4000-8000-000000000007";
const transcript = "User: Who owns Launch?\n\nAssistant: Riya owns Launch.";
const fingerprint = projectBrainSourceFingerprint(
  `chat:${threadId}`,
  transcript,
);

const queuedRun = {
  id: runId,
  projectId,
  requestedByUserId: "owner-1",
  sourceType: "chat",
  sourceItemId: null,
  chatSourceId: sourceId,
  sourceVersionId: versionId,
  sourceFingerprint: fingerprint,
  status: "queued",
  attempts: 0,
  createdAt: new Date("2026-11-08T00:00:00Z"),
};

const extraction = {
  entities: [
    {
      id: "riya",
      type: "person",
      title: "Riya",
      aliases: [],
      evidence: "Riya owns Launch",
      facts: [],
    },
  ],
  facts: [
    {
      subject: "Riya",
      predicate: "owns",
      object: "Launch",
      evidence: "Riya owns Launch",
      confidence: 0.9,
    },
  ],
  relations: [],
  todos: [],
  timeline: [],
};

function makeQuery(rows: unknown[], options?: { claim?: boolean }) {
  const query: TestBuilder = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () =>
      options?.claim
        ? { for: () => Promise.resolve(rows) }
        : Promise.resolve(rows),
  };
  return query;
}

function makeInsertBuilder(table: unknown) {
  let values: unknown;
  const builder: TestBuilder = {
    values: (input: unknown) => {
      values = input;
      if (table === ProjectBrainPageTable) {
        mocks.insertedPages.push(...(Array.isArray(input) ? input : [input]));
      }
      if (table === ProjectBrainFactTable) {
        mocks.insertedFacts.push(...(Array.isArray(input) ? input : [input]));
      }
      return builder;
    },
    onConflictDoNothing: () => builder,
    onConflictDoUpdate: () => builder,
    returning: () => {
      if (table === ProjectBrainPageTable) {
        return Promise.resolve([{ id: pageId }]);
      }
      if (table === ProjectBrainFactTable) {
        const factValues = Array.isArray(values) ? values : [];
        return Promise.resolve(
          factValues.map((fact, index) => ({
            ...(fact as Record<string, unknown>),
            id: index === 0 ? factId : `fact-${index}`,
          })),
        );
      }
      return Promise.resolve([]);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedFacts = [];
  mocks.insertedPages = [];
  mocks.selectedTables = [];
  mocks.updates = [];
  mocks.claimTransactionCount = 0;
  mocks.source = {
    id: sourceId,
    projectId,
    ownerUserId: "owner-1",
    activeFingerprint: fingerprint,
    revokedAt: null,
    threadId,
    threadProjectId: projectId,
    threadUserId: "owner-1",
  };
  mocks.getProjectAccess.mockResolvedValue({
    role: "owner",
    project: { id: projectId, teamId: null, collectionIds: [] },
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([]);
  mocks.mayEditProject.mockReturnValue(true);
  mocks.generateObject.mockResolvedValue({ object: extraction, usage: {} });
  mocks.runInference.mockImplementation(
    async ({
      run,
    }: {
      run: (options: { model: null; onProviderStart: () => void }) => Promise<{
        value: unknown;
      }>;
    }) => {
      const result = await run({ model: null, onProviderStart: vi.fn() });
      return result.value;
    },
  );
  mocks.maintenance.mockResolvedValue({
    salienceUpdated: 0,
    stalePagesArchived: 0,
    warnings: [],
  });
  mocks.rateLimit.mockResolvedValue({ allowed: true });

  mocks.select.mockImplementation(() => {
    let table: unknown;
    const builder: TestBuilder = {
      from: (input: unknown) => {
        table = input;
        mocks.selectedTables.push(table);
        if (table === ProjectBrainChatSourceTable) {
          return makeQuery(mocks.source ? [mocks.source] : []);
        }
        if (table === ChatMessageTable) {
          return makeQuery([
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
        if (table === ProjectBrainSourceVersionTable) {
          return makeQuery([
            {
              id: versionId,
              projectId,
              chatSourceId: sourceId,
              sourceType: "chat",
              sourceFingerprint: fingerprint,
              contentLength: transcript.length,
              contentSnapshot: transcript,
            },
          ]);
        }
        return makeQuery([]);
      },
      innerJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => ({ for: () => Promise.resolve([queuedRun]) }),
    };
    return builder;
  });

  mocks.tx.select.mockImplementation(() => {
    let table: unknown;
    return {
      from: (input: unknown) => {
        table = input;
        return makeQuery(table === ProjectBrainRunTable ? [queuedRun] : [], {
          claim: table === ProjectBrainRunTable,
        });
      },
    };
  });
  mocks.tx.insert.mockImplementation((table: unknown) =>
    makeInsertBuilder(table),
  );
  mocks.tx.update.mockImplementation(() => {
    let setValues: Record<string, unknown> = {};
    const builder: TestBuilder = {
      set: (input: Record<string, unknown>) => {
        setValues = input;
        mocks.updates.push(input);
        return builder;
      },
      where: () =>
        setValues.status === "running" ? builder : Promise.resolve([]),
      returning: () =>
        Promise.resolve(
          setValues.status === "running"
            ? [{ ...queuedRun, ...setValues, status: "running" }]
            : [],
        ),
    };
    return builder;
  });
  mocks.update.mockImplementation(() => {
    const builder: TestBuilder = {
      set: () => builder,
      where: () => Promise.resolve([]),
    };
    return builder;
  });
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => {
      mocks.claimTransactionCount += 1;
      return callback(mocks.tx);
    },
  );
});

describe("project brain request-bound dispatch", () => {
  it("schedules only the newly queued run after the response", async () => {
    const run = vi.fn().mockResolvedValue({ completed: 1 });
    await scheduleProjectBrainQueueTick(runId, run);

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(run).toHaveBeenCalledWith(expect.any(Date), runId);
  });

  it("executes through the claimed queue when no request context exists", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("no request context");
    });
    const run = vi.fn().mockResolvedValue({ completed: 1 });
    await scheduleProjectBrainQueueTick(runId, run);
    expect(run).toHaveBeenCalledWith(expect.any(Date), runId);
  });

  it("keeps a failed queue tick recoverable without failing the upload", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.after.mockImplementation(() => {
      throw new Error("no request context");
    });
    const run = vi.fn().mockRejectedValue(new Error("database unavailable"));
    await expect(
      scheduleProjectBrainQueueTick(runId, run),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});

describe("completed project chat brain lifecycle", () => {
  it("extracts an owned completed chat into reviewable proposed facts", async () => {
    const result = await processProjectBrainQueue();

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(mocks.runInference).toHaveBeenCalledOnce();
    expect(mocks.generateObject).toHaveBeenCalledOnce();
    expect(mocks.insertedPages).toEqual([
      expect.objectContaining({
        projectId,
        entityType: "person",
        normalizedTitle: "riya",
      }),
    ]);
    expect(mocks.insertedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          runId,
          sourceVersionId: versionId,
          sourceItemId: null,
          sourceType: "chat",
          chatSourceId: sourceId,
          subject: "Riya",
          predicate: "owns",
          object: "Launch",
          reviewStatus: "proposed",
        }),
      ]),
    );
    expect(mocks.insertedFacts.length).toBeGreaterThan(0);
    expect(mocks.notify).toHaveBeenCalledWith({
      projectId,
      runId,
      factCount: 2,
      todoCount: 0,
    });
    const inferenceCall = mocks.generateObject.mock.calls[0]?.[0];
    expect(inferenceCall.prompt).toContain(transcript);
    expect(inferenceCall.prompt).not.toContain("private.pdf");
  });

  it.each([
    ["revoked", { revokedAt: new Date("2026-11-08T00:00:00Z") }],
    ["stale fingerprint", { activeFingerprint: "old-fingerprint" }],
    [
      "foreign owner",
      { ownerUserId: "other-owner", threadUserId: "other-owner" },
    ],
  ])("does not extract a %s chat source", async (_name, sourcePatch) => {
    mocks.source = { ...mocks.source, ...sourcePatch };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processProjectBrainQueue();

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1 });
    expect(mocks.selectedTables).not.toContain(ChatMessageTable);
    expect(mocks.runInference).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.insertedFacts).toEqual([]);
    errorSpy.mockRestore();
  });
});
