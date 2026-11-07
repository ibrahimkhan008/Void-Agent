import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  loadContext: vi.fn(),
  generateStatus: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  notifyProjectHealthTransition: vi.fn(),
  budgetsEnabled: vi.fn(),
  getStatusModel: vi.fn(),
  reserveBudget: vi.fn(),
  settleBudget: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/notifications/project-health", () => ({
  notifyProjectHealthTransition: mocks.notifyProjectHealthTransition,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/ai/model-pricing.server", () => ({
  getTeamMemberBudgetsEnabled: mocks.budgetsEnabled,
}));
vi.mock("lib/projects/project-brain-status", () => ({
  loadProjectBrainStatusContext: mocks.loadContext,
  generateProjectBrainStatusWithUsage: mocks.generateStatus,
  getProjectBrainStatusModel: mocks.getStatusModel,
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  normalizeModelUsage: (usage: unknown) => {
    if (!usage || typeof usage !== "object") return null;
    const value = usage as Record<string, unknown>;
    return typeof value.inputTokens === "number" &&
      typeof value.outputTokens === "number"
      ? { inputTokens: value.inputTokens, outputTokens: value.outputTokens }
      : null;
  },
  reserveTeamBudgetForAiRequest: mocks.reserveBudget,
  settleTeamBudgetForAiRequest: mocks.settleBudget,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert },
}));

import { GET, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const sourceContext = {
  input: { project: { name: "Launch" }, facts: [], acceptedTasks: [] },
  inputFingerprint: "a".repeat(64),
  sourceRefs: [{ sourceItemId: "item-1", sourceVersionId: "version-1" }],
};
const snapshot = {
  id: "snapshot-1",
  health: "yellow",
  progressPct: 65,
  summary: "Release work is progressing.",
  blockers: ["Review release notes"],
  createdAt: new Date("2026-11-06T10:00:00.000Z"),
};
const params = { params: Promise.resolve({ id: projectId }) };
const request = (method: "GET" | "POST", origin?: string) =>
  new Request(`http://localhost/api/projects/${projectId}/brain/status`, {
    method,
    headers: origin ? { Origin: origin } : undefined,
  });

function queryWithRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: async () => rows }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: {
      id: projectId,
      name: "Launch",
      goal: null,
      description: null,
      systemPrompt: null,
      collectionIds: ["collection-1"],
    },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["user-1"]);
  mocks.loadContext.mockResolvedValue(sourceContext);
  mocks.generateStatus.mockResolvedValue({
    status: {
      health: "yellow",
      progressPct: 65,
      summary: "Release work is progressing.",
      blockers: ["Review release notes"],
    },
    usage: { inputTokens: 10, outputTokens: 5 },
  });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockImplementation(() => queryWithRows([]));
  mocks.returning.mockResolvedValue([snapshot]);
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.budgetsEnabled.mockResolvedValue(false);
  mocks.getStatusModel.mockResolvedValue({
    provider: "flare",
    model: "Model A",
  });
  mocks.reserveBudget.mockResolvedValue({
    reservationId: "reservation-1",
    estimateMicros: 100,
    price: {
      inputMicrosPerMillion: 1,
      outputMicrosPerMillion: 1,
      currency: "EUR",
    },
  });
  mocks.settleBudget.mockResolvedValue(undefined);
});

describe("project brain status snapshot API", () => {
  it("returns only a snapshot matching the caller's current visible evidence", async () => {
    mocks.select.mockImplementationOnce(() => queryWithRows([snapshot]));
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: { ...snapshot, createdAt: snapshot.createdAt.toISOString() },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadContext).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionIds: ["collection-1"],
        ownerIds: ["user-1"],
      }),
    );
  });

  it("requires an authenticated project member for reads", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), params)).status).toBe(401);
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), params)).status).toBe(404);
  });

  it("requires same-origin editor access before generating a summary", async () => {
    expect((await POST(request("POST"), params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: ["collection-1"] },
      role: "viewer",
    });
    expect(
      (await POST(request("POST", "https://attacker.invalid"), params)).status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
      },
      role: "editor",
    });
    expect(mocks.generateStatus).not.toHaveBeenCalled();
  });

  it("returns an explicit empty-evidence response without calling the model", async () => {
    mocks.loadContext.mockResolvedValueOnce(null);
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(422);
    expect(mocks.generateStatus).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("persists the bounded model result with source revision provenance", async () => {
    mocks.select
      .mockImplementationOnce(() => queryWithRows([]))
      .mockImplementationOnce(() => queryWithRows([snapshot]));
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: { ...snapshot, createdAt: snapshot.createdAt.toISOString() },
    });
    expect(mocks.generateStatus).toHaveBeenCalledWith(
      sourceContext.input,
      25_000,
      { model: undefined, signal: expect.any(AbortSignal) },
    );
    expect(mocks.values).toHaveBeenCalledWith({
      projectId,
      generatedByUserId: "user-1",
      inputFingerprint: sourceContext.inputFingerprint,
      sourceRefs: sourceContext.sourceRefs,
      health: "yellow",
      progressPct: 65,
      summary: "Release work is progressing.",
      blockers: ["Review release notes"],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("notifies after persisting a valid health transition", async () => {
    mocks.select
      .mockImplementationOnce(() => queryWithRows([]))
      .mockImplementationOnce(() => queryWithRows([{ health: "yellow" }]));
    mocks.generateStatus.mockResolvedValueOnce({
      status: { ...snapshot, health: "red" },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const response = await POST(request("POST", "http://localhost"), params);

    expect(response.status).toBe(200);
    expect(mocks.returning).toHaveBeenCalledOnce();
    expect(mocks.notifyProjectHealthTransition).toHaveBeenCalledWith({
      projectId,
      inputFingerprint: sourceContext.inputFingerprint,
      previousHealth: "yellow",
      health: "red",
    });
  });

  it("suppresses transition alerts when a stored health value is outside the contract", async () => {
    mocks.select
      .mockImplementationOnce(() => queryWithRows([]))
      .mockImplementationOnce(() => queryWithRows([{ health: "corrupt" }]));
    mocks.generateStatus.mockResolvedValueOnce({
      status: { ...snapshot, health: "red" },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const response = await POST(request("POST", "http://localhost"), params);

    expect(response.status).toBe(200);
    expect(mocks.notifyProjectHealthTransition).toHaveBeenCalledWith({
      projectId,
      inputFingerprint: sourceContext.inputFingerprint,
      previousHealth: null,
      health: "red",
    });
  });

  it("reuses a matching snapshot without starting another billable model run", async () => {
    mocks.select.mockImplementationOnce(() => queryWithRows([snapshot]));
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(200);
    expect(mocks.generateStatus).not.toHaveBeenCalled();
    expect(mocks.reserveBudget).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("reserves from persisted team scope and finalizes exact provider usage", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
        teamId: "trusted-team-1",
      },
      role: "editor",
    });
    mocks.budgetsEnabled.mockResolvedValue(true);
    mocks.select
      .mockImplementationOnce(() => queryWithRows([]))
      .mockImplementationOnce(() => queryWithRows([]));
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(200);
    expect(mocks.reserveBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "trusted-team-1",
        userId: "user-1",
        model: { provider: "flare", model: "Model A" },
        idempotencyScope: expect.stringContaining(
          sourceContext.inputFingerprint,
        ),
      }),
    );
    expect(mocks.generateStatus).toHaveBeenCalledWith(
      sourceContext.input,
      25_000,
      {
        model: { provider: "flare", model: "Model A" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
      { usage: { inputTokens: 10, outputTokens: 5 } },
    );
  });

  it("settles the estimate when successful provider usage is unavailable", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
        teamId: "trusted-team-1",
      },
      role: "editor",
    });
    mocks.budgetsEnabled.mockResolvedValue(true);
    mocks.select.mockImplementationOnce(() => queryWithRows([]));
    mocks.generateStatus.mockResolvedValueOnce({
      status: { health: "yellow", summary: "Summary", blockers: [] },
      usage: undefined,
    });
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(502);
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
      { usage: undefined },
    );
    expect(mocks.settleBudget).not.toHaveBeenCalledWith(expect.anything(), {
      aborted: true,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not release a reservation when settlement fails after inference", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
        teamId: "trusted-team-1",
      },
      role: "editor",
    });
    mocks.budgetsEnabled.mockResolvedValue(true);
    mocks.select.mockImplementationOnce(() => queryWithRows([]));
    mocks.settleBudget.mockRejectedValueOnce(new Error("ledger unavailable"));

    const response = await POST(request("POST", "http://localhost"), params);

    expect(response.status).toBe(502);
    expect(mocks.settleBudget).toHaveBeenCalledTimes(1);
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
      { usage: { inputTokens: 10, outputTokens: 5 } },
    );
    expect(mocks.settleBudget).not.toHaveBeenCalledWith(expect.anything(), {
      aborted: true,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("settles usage but rejects stale project evidence after inference", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
        teamId: "trusted-team-1",
      },
      role: "editor",
    });
    mocks.budgetsEnabled.mockResolvedValue(true);
    mocks.select.mockImplementationOnce(() => queryWithRows([]));
    mocks.loadContext
      .mockResolvedValueOnce(sourceContext)
      .mockResolvedValueOnce({
        ...sourceContext,
        inputFingerprint: "b".repeat(64),
      });
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(409);
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
      { usage: { inputTokens: 10, outputTokens: 5 } },
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
