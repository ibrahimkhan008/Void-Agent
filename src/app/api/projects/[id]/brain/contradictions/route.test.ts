import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  txSelect: vi.fn(),
  txWhere: vi.fn(),
  joinCount: vi.fn(),
  txUpdate: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  txInsert: vi.fn(),
  insertValues: vi.fn(),
  insertConflict: vi.fn(),
  insert: vi.fn(),
  insertBatchValues: vi.fn(),
  insertBatchConflict: vi.fn(),
  checkApiRateLimit: vi.fn(),
  judgeProjectBrainConflictCandidates: vi.fn(),
  historyFactPredicates: [] as unknown[],
  decisionPredicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    transaction: mocks.transaction,
    select: mocks.select,
    insert: mocks.insert,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/projects/brain-contradictions", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("lib/projects/brain-contradictions")>();
  return {
    ...original,
    judgeProjectBrainConflictCandidates:
      mocks.judgeProjectBrainConflictCandidates,
  };
});

import { GET, PATCH, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const firstId = "00000000-0000-4000-8000-000000000002";
const secondId = "00000000-0000-4000-8000-000000000003";

const makeRequest = (body: unknown) =>
  new Request(
    `http://localhost/api/projects/${projectId}/brain/contradictions`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const invoke = (body: unknown) =>
  PATCH(makeRequest(body), { params: Promise.resolve({ id: projectId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.historyFactPredicates.length = 0;
  mocks.decisionPredicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: {
      id: projectId,
      collectionIds: ["00000000-0000-4000-8000-000000000004"],
    },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["member-1"]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  configureFactRows([
    { id: firstId, subject: "Release", predicate: "status", object: "ready" },
    {
      id: secondId,
      subject: "release",
      predicate: "STATUS",
      object: "blocked",
    },
  ]);
  mocks.updateWhere.mockResolvedValue([]);
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.txUpdate.mockReturnValue({ set: mocks.updateSet });
  mocks.insertConflict.mockResolvedValue([]);
  mocks.insertValues.mockReturnValue({
    onConflictDoUpdate: mocks.insertConflict,
  });
  mocks.txInsert.mockReturnValue({ values: mocks.insertValues });
  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) =>
      callback({
        select: mocks.txSelect,
        update: mocks.txUpdate,
        insert: mocks.txInsert,
      }),
  );
  mocks.select.mockReset();
  mocks.insertBatchConflict.mockResolvedValue([]);
  mocks.insertBatchValues.mockReturnValue({
    onConflictDoNothing: mocks.insertBatchConflict,
  });
  mocks.insert.mockReturnValue({ values: mocks.insertBatchValues });
});

describe("POST project brain conflict scan", () => {
  const facts = [
    {
      id: firstId,
      sourceItemId: "00000000-0000-4000-8000-000000000010",
      subjectPageId: "00000000-0000-4000-8000-000000000020",
      subject: "Release",
      predicate: "status",
      object: "ready",
      evidence: "The release is ready.",
    },
    {
      id: secondId,
      sourceItemId: "00000000-0000-4000-8000-000000000011",
      subjectPageId: "00000000-0000-4000-8000-000000000020",
      subject: "Release",
      predicate: "status",
      object: "blocked",
      evidence: "The release is blocked.",
    },
  ];
  const query = (rows: unknown[]) => {
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: (predicate: unknown) => {
        mocks.decisionPredicates.push(predicate);
        return builder;
      },
      orderBy: () => builder,
      limit: async () => rows,
    };
    return builder;
  };
  const request = (origin = "http://localhost") =>
    new Request(
      `http://localhost/api/projects/${projectId}/brain/contradictions`,
      { method: "POST", headers: { Origin: origin } },
    );

  it("classifies only current visible accepted cross-source facts and persists without overwriting", async () => {
    mocks.select
      .mockReturnValueOnce(query(facts))
      .mockReturnValueOnce(query([]));
    mocks.judgeProjectBrainConflictCandidates.mockResolvedValue([
      {
        candidate: {
          first: facts[0],
          second: facts[1],
          pageId: "00000000-0000-4000-8000-000000000020",
        },
        verdict: "contradiction",
        explanation: "The statuses conflict.",
      },
    ]);

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      scanned: 1,
      classified: 1,
      contradictions: 1,
      compatible: 0,
      unknown: 0,
    });
    const sql = new PgDialect().sqlToQuery(
      mocks.decisionPredicates[0] as never,
    );
    expect(sql.sql).toContain('"collection_item"."collection_id"');
    expect(sql.sql).toContain('"collection"."user_id"');
    expect(sql.sql).toContain('"project_brain_source_state"');
    expect(sql.params).toContain("accepted");
    expect(mocks.insertBatchValues).toHaveBeenCalledWith([
      expect.objectContaining({
        projectId,
        status: "open",
        verdict: "contradiction",
      }),
    ]);
    expect(mocks.insertBatchConflict).toHaveBeenCalledOnce();
  });

  it("rejects viewers and cross-origin scans before querying facts", async () => {
    expect(
      (
        await POST(request("https://attacker.invalid"), {
          params: Promise.resolve({ id: projectId }),
        })
      ).status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: ["collection-1"] },
      role: "viewer",
    });
    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ id: projectId }),
        })
      ).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not spend another model call on an already classified fact pair", async () => {
    mocks.select
      .mockReturnValueOnce(query(facts))
      .mockReturnValueOnce(query([{ factIdA: firstId, factIdB: secondId }]));

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scanned: 0,
      classified: 0,
    });
    expect(mocks.judgeProjectBrainConflictCandidates).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("GET project brain conflict history", () => {
  it("returns closed decisions with revision identity for currently accessible source facts", async () => {
    const resolvedAt = new Date("2026-11-06T10:00:00.000Z");
    const sourceDate = new Date("2026-11-05T10:00:00.000Z");
    const decisions = [
      {
        id: "decision-1",
        factIdA: firstId,
        factIdB: secondId,
        status: "resolved",
        verdict: "potential",
        explanation: "Different release dates",
        keptFactId: firstId,
        updatedAt: resolvedAt,
      },
    ];
    const facts = [
      {
        id: firstId,
        sourceItemId: "item-a",
        sourceVersionId: "version-a",
        subject: "Release",
        predicate: "date",
        object: "Nov 5",
        evidence: "Release is Nov 5",
        reviewStatus: "accepted",
        filename: "plan-a.md",
        sourceVersionCreatedAt: sourceDate,
      },
      {
        id: secondId,
        sourceItemId: "item-b",
        sourceVersionId: "version-b",
        subject: "Release",
        predicate: "date",
        object: "Nov 8",
        evidence: "Release is Nov 8",
        reviewStatus: "rejected",
        filename: "plan-b.md",
        sourceVersionCreatedAt: sourceDate,
      },
    ];
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => decisions }) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: async (predicate: unknown) => {
                  mocks.historyFactPredicates.push(predicate);
                  return facts;
                },
              }),
            }),
          }),
        }),
      });

    const response = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/brain/contradictions?history=true`,
      ),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.history).toHaveLength(1);
    expect(payload.history[0]).toMatchObject({
      status: "resolved",
      keptFactId: firstId,
      first: { sourceVersionId: "version-a", filename: "plan-a.md" },
      second: { sourceVersionId: "version-b", filename: "plan-b.md" },
    });
    expect(payload.history[0].first).not.toHaveProperty(
      "sourceVersionSnapshot",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const scope = new PgDialect().sqlToQuery(
      mocks.historyFactPredicates[0] as never,
    );
    expect(scope.sql).toContain('"collection_item"."collection_id"');
    expect(scope.sql).toContain('"collection"."user_id"');
    expect(scope.sql).toContain('"collection_item"."status"');
  });

  it("requires an authenticated user and an accessible project", async () => {
    mocks.getSession.mockResolvedValue(null);
    const request = new Request(
      `http://localhost/api/projects/${projectId}/brain/contradictions`,
    );
    expect(
      (await GET(request, { params: Promise.resolve({ id: projectId }) }))
        .status,
    ).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getProjectAccess.mockResolvedValue(null);
    expect(
      (await GET(request, { params: Promise.resolve({ id: projectId }) }))
        .status,
    ).toBe(404);
  });

  it("keeps the reference GET contract for open contradictions", async () => {
    mocks.select.mockReturnValueOnce({
      from: () => ({
        where: (predicate: unknown) => {
          mocks.decisionPredicates.push(predicate);
          return { orderBy: () => ({ limit: async () => [] }) };
        },
      }),
    });
    const response = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/brain/contradictions`,
      ),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contradictions: [] });
    const predicate = new PgDialect().sqlToQuery(
      mocks.decisionPredicates[0] as never,
    );
    expect(predicate.params).toContain("open");
    expect(predicate.params).toContain("contradiction");
  });
});

function configureFactRows(facts: Array<Record<string, unknown>>) {
  const query = {
    innerJoin: () => {
      mocks.joinCount(mocks.joinCount.mock.calls.length + 1);
      return query;
    },
    where: (predicate: unknown) => {
      mocks.txWhere(predicate);
      return query;
    },
    for: async () => facts.map((fact) => ({ fact })),
  };
  mocks.txSelect.mockReturnValue({ from: () => query });
}

describe("PATCH project brain conflict resolution", () => {
  it("locks project facts and atomically keeps one value", async () => {
    const response = await invoke({
      firstFactId: firstId,
      secondFactId: secondId,
      keepFactId: firstId,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      keptFactId: firstId,
      rejectedFactId: secondId,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.txUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.txInsert).toHaveBeenCalledOnce();
    expect(mocks.insertValues.mock.calls[0]?.[0]).toMatchObject({
      projectId,
      verdict: "potential",
      status: "resolved",
      resolvedByUserId: "member-1",
      keptFactId: firstId,
    });
    expect(mocks.insertConflict).toHaveBeenCalledOnce();
    expect(mocks.joinCount).toHaveBeenCalledTimes(2);
    const scope = new PgDialect().sqlToQuery(
      mocks.txWhere.mock.calls[0]?.[0] as never,
    );
    expect(scope.sql).toContain('"collection_item"."collection_id"');
    expect(scope.sql).toContain('"collection"."user_id"');
    expect(scope.sql).toContain('"collection_item"."status"');
    expect(
      mocks.updateSet.mock.calls.map(([value]) => value.reviewStatus),
    ).toEqual(["accepted", "rejected"]);
  });

  it("does not write when the facts are not a subject/predicate conflict", async () => {
    configureFactRows([
      { id: firstId, subject: "Release", predicate: "status", object: "ready" },
      {
        id: secondId,
        subject: "Release",
        predicate: "owner",
        object: "blocked",
      },
    ]);
    const response = await invoke({
      firstFactId: firstId,
      secondFactId: secondId,
      keepFactId: firstId,
    });

    expect(response.status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("rejects viewers before opening a transaction", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId },
      role: "viewer",
    });
    const response = await invoke({
      firstFactId: firstId,
      secondFactId: secondId,
      keepFactId: firstId,
    });

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not allow resolving facts after all source collections are detached", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: [] },
      role: "editor",
    });
    const response = await invoke({
      firstFactId: firstId,
      secondFactId: secondId,
      keepFactId: firstId,
    });

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("lets an editor dismiss a candidate without changing either fact", async () => {
    const response = await invoke({
      firstFactId: firstId,
      secondFactId: secondId,
      action: "dismiss",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dismissed: true });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.insertValues.mock.calls[0]?.[0]).toMatchObject({
      status: "dismissed",
      resolvedByUserId: "member-1",
    });
  });
});
