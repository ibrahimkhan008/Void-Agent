import { PgDialect } from "drizzle-orm/pg-core";
import { TeamBudgetExceededError } from "lib/ai/team-member-ai-budget-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  getTeamRole: vi.fn(),
  checkApiRateLimit: vi.fn(),
  getBudgetEnabled: vi.fn(),
  getBudgetModel: vi.fn(),
  getPinnedModel: vi.fn(),
  reserveBudget: vi.fn(),
  settleBudget: vi.fn(),
  select: vi.fn(),
  judgeBrainPageDuplicateCandidatesWithUsage: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  getTeamRole: mocks.getTeamRole,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/ai/model-pricing.server", () => ({
  getTeamMemberBudgetsEnabled: mocks.getBudgetEnabled,
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
vi.mock("lib/projects/project-brain-status", () => ({
  getProjectBrainStatusModel: mocks.getBudgetModel,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelAsync: mocks.getPinnedModel,
    getModelWithFailureFallbackAsync: vi
      .fn()
      .mockResolvedValue({ id: "fallback-model" }),
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock(
  "lib/projects/brain-page-duplicate-candidates",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("lib/projects/brain-page-duplicate-candidates")
      >();
    return {
      ...original,
      judgeBrainPageDuplicateCandidatesWithUsage:
        mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    };
  },
);

import { POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const pageA = "00000000-0000-4000-8000-000000000003";
const pageB = "00000000-0000-4000-8000-000000000004";
const params = { params: Promise.resolve({ id: projectId }) };

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

function makeRequest(
  payload: unknown = { pairs: [{ firstPageId: pageA, secondPageId: pageB }] },
  origin = "https://void.test",
) {
  return new Request(
    `https://void.test/api/projects/${projectId}/brain/pages/dedupe`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

const visibleFacts = [
  {
    pageId: pageA,
    title: "Riya Shah",
    entityType: "person",
    salience: 2,
    subject: "Riya Shah",
    predicate: "entity type",
    object: "person",
    evidence: "Riya Shah is a person.",
  },
  {
    pageId: pageA,
    title: "Riya Shah",
    entityType: "person",
    salience: 2,
    subject: "Riya Shah",
    predicate: "works at",
    object: "Northwind",
    evidence: "Riya Shah works at Northwind.",
  },
  {
    pageId: pageB,
    title: "Riya Sha",
    entityType: "person",
    salience: 1,
    subject: "Riya Sha",
    predicate: "entity type",
    object: "person",
    evidence: "Riya Sha is a person.",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: "editor-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    role: "editor",
    project: { collectionIds: [collectionId] },
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
  mocks.getTeamRole.mockResolvedValue("editor");
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.getBudgetEnabled.mockResolvedValue(false);
  mocks.getBudgetModel.mockResolvedValue({
    provider: "flare",
    model: "Model A",
  });
  mocks.getPinnedModel.mockResolvedValue({ id: "pinned-model" });
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
  mocks.select.mockReturnValue(query(visibleFacts));
  mocks.judgeBrainPageDuplicateCandidatesWithUsage.mockImplementation(
    async (_inputs: unknown, options?: { onProviderComplete?: () => void }) => {
      options?.onProviderComplete?.();
      return {
        judgments: [
          {
            firstPageId: pageA,
            secondPageId: pageB,
            verdict: "same_entity",
            explanation: "Both accepted claims identify the same person.",
          },
        ],
        usage: { inputTokens: 25, outputTokens: 10 },
      };
    },
  );
});

describe("POST project brain duplicate judgment", () => {
  it("judges only a current, visible, accepted candidate and returns an advisory result", async () => {
    const response = await POST(makeRequest(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      results: [
        { verdict: "same_entity", firstPageId: pageA, secondPageId: pageB },
      ],
    });
    const query = new PgDialect().sqlToQuery(mocks.predicates[0] as never);
    expect(query.sql).toContain('"collection_item"."collection_id"');
    expect(query.sql).toContain('"collection"."user_id"');
    expect(query.sql).toContain('"collection_item"."status"');
    expect(query.sql).toContain('"project_brain_source_state"');
    expect(query.sql).toContain('"project_brain_fact"."review_status"');
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          firstPageId: pageA,
          firstFacts: expect.arrayContaining([
            expect.objectContaining({ claim: "Riya Shah works at Northwind" }),
          ]),
        }),
      ],
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
  });

  it("rejects cross-origin, viewers and invalid pairs before querying evidence", async () => {
    expect(
      (await POST(makeRequest(undefined, "https://attacker.invalid"), params))
        .status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { collectionIds: [collectionId] },
    });
    expect((await POST(makeRequest(), params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId] },
    });
    expect(
      (
        await POST(
          makeRequest({ pairs: [{ firstPageId: pageA, secondPageId: pageA }] }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("bounds request bodies even when Content-Length is not supplied", async () => {
    const oversized = new Request(
      `https://void.test/api/projects/${projectId}/brain/pages/dedupe`,
      {
        method: "POST",
        headers: {
          Origin: "https://void.test",
          "Content-Type": "application/json",
        },
        body: new Uint8Array(5_000),
      },
    );
    expect((await POST(oversized, params)).status).toBe(413);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("refuses a pair that is no longer backed by current visible identity evidence", async () => {
    mocks.select.mockReturnValue(query(visibleFacts.slice(0, 1)));
    const response = await POST(makeRequest(), params);
    expect(response.status).toBe(409);
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).not.toHaveBeenCalled();
  });

  it("pins and settles team-member model usage from persisted project scope", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId], teamId: "team-1" },
    });
    mocks.getBudgetEnabled.mockResolvedValue(true);
    const response = await POST(makeRequest(), params);
    expect(response.status).toBe(200);
    expect(mocks.getTeamRole).toHaveBeenCalledWith("team-1", "editor-1");
    expect(mocks.reserveBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        userId: "editor-1",
        model: { provider: "flare", model: "Model A" },
        idempotencyScope: expect.stringContaining("project-brain-page-dedupe:"),
      }),
    );
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: { provider: "flare", model: "Model A" },
      }),
    );
    expect(mocks.settleBudget).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "reservation-1" }),
      { usage: { inputTokens: 25, outputTokens: 10 } },
    );
  });

  it("exempts team owners but rejects project editors without team membership", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId], teamId: "team-1" },
    });
    mocks.getBudgetEnabled.mockResolvedValue(true);
    mocks.getTeamRole.mockResolvedValueOnce("owner");
    const ownerResponse = await POST(makeRequest(), params);
    expect(ownerResponse.status).toBe(200);
    expect(mocks.reserveBudget).not.toHaveBeenCalled();
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage.mock.calls[0]?.[1],
    ).not.toHaveProperty("model");

    mocks.getTeamRole.mockResolvedValueOnce(null);
    const outsiderResponse = await POST(makeRequest(), params);
    expect(outsiderResponse.status).toBe(403);
    expect(mocks.reserveBudget).not.toHaveBeenCalled();
  });

  it("fails closed at the cap and on missing model prices", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId], teamId: "team-1" },
    });
    mocks.getBudgetEnabled.mockResolvedValue(true);
    mocks.reserveBudget.mockRejectedValueOnce(new TeamBudgetExceededError());
    expect((await POST(makeRequest(), params)).status).toBe(402);
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).not.toHaveBeenCalled();

    mocks.getBudgetModel.mockResolvedValueOnce(null);
    expect((await POST(makeRequest(), params)).status).toBe(503);
    expect(
      mocks.judgeBrainPageDuplicateCandidatesWithUsage,
    ).not.toHaveBeenCalled();
  });

  it("releases only a provider-failed reservation, never one after completed inference", async () => {
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [collectionId], teamId: "team-1" },
    });
    mocks.getBudgetEnabled.mockResolvedValue(true);
    mocks.judgeBrainPageDuplicateCandidatesWithUsage.mockRejectedValueOnce(
      new Error("provider failure"),
    );
    expect((await POST(makeRequest(), params)).status).toBe(502);
    expect(mocks.settleBudget).toHaveBeenCalledWith(expect.anything(), {
      aborted: true,
    });

    mocks.settleBudget.mockReset();
    mocks.settleBudget.mockRejectedValue(new Error("ledger unavailable"));
    expect((await POST(makeRequest(), params)).status).toBe(502);
    expect(mocks.settleBudget).toHaveBeenCalledTimes(1);
    expect(mocks.settleBudget).toHaveBeenCalledWith(expect.anything(), {
      usage: { inputTokens: 25, outputTokens: 10 },
    });
  });
});
