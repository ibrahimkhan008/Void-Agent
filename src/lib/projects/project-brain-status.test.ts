import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  generateObject: vi.fn(),
  predicates: [] as unknown[],
  getModelsConfig: vi.fn(),
  ensureDynamicProvidersHydrated: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/ai/models", () => ({
  ensureDynamicProvidersHydrated: mocks.ensureDynamicProvidersHydrated,
  customModelProvider: {
    modelsInfo: [{ provider: "flare", models: [{ name: "Model A" }] }],
    getModelWithFailureFallbackAsync: async () => ({ model: "test" }),
    getModelAsync: async (model: unknown) => ({ model }),
  },
}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getModelsConfig },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import {
  generateProjectBrainStatus,
  generateProjectBrainStatusWithUsage,
  getProjectBrainStatusModel,
  loadProjectBrainStatusContext,
} from "./project-brain-status";

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Launch",
  goal: "Ship the release",
  description: null,
  systemPrompt: "Use factual project language",
};

const facts = [
  {
    id: "fact-1",
    sourceItemId: "00000000-0000-4000-8000-000000000010",
    sourceVersionId: "00000000-0000-4000-8000-000000000011",
    subject: "Release",
    predicate: "status",
    object: "ready",
    evidence: "The release is ready.",
    filename: "release.md",
  },
];
const todos = [
  {
    id: "todo-1",
    sourceItemId: "00000000-0000-4000-8000-000000000012",
    sourceVersionId: "00000000-0000-4000-8000-000000000013",
    title: "Publish release notes",
    details: "Finalize notes",
    evidence: "The release notes are accepted as a task.",
    dueDate: null,
    filename: "plan.md",
  },
];
const events = [
  {
    id: "event-1",
    sourceItemId: "00000000-0000-4000-8000-000000000014",
    sourceVersionId: "00000000-0000-4000-8000-000000000015",
    summary: "Release candidate approved",
    detail: "The review completed successfully.",
    evidence: "The release candidate was approved on 2026-01-09.",
    eventDate: "2026-01-09",
    filename: "release-review.md",
  },
];

function query(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: (predicate: unknown) => {
      mocks.predicates.push(predicate);
      return builder;
    },
    orderBy: () => builder,
    limit: async () => rows,
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getModelsConfig.mockResolvedValue({
    providers: [{ id: "flare", enabled: true, defaultModel: "Model A" }],
  });
  mocks.select
    .mockReturnValueOnce(query(facts))
    .mockReturnValueOnce(query(todos))
    .mockReturnValueOnce(query(events));
});

describe("project brain status synthesis", () => {
  it("uses only visible accepted current-revision facts, tasks, and events", async () => {
    const context = await loadProjectBrainStatusContext({
      project,
      collectionIds: ["collection-a"],
      ownerIds: ["owner-a"],
    });

    expect(context?.input.facts).toHaveLength(1);
    expect(context?.input.acceptedTasks).toHaveLength(1);
    expect(context?.input.acceptedTimelineEvents).toEqual([
      {
        id: "event-1",
        source: "release-review.md",
        date: "2026-01-09",
        summary: "Release candidate approved",
        detail: "The review completed successfully.",
        evidence: "The release candidate was approved on 2026-01-09.",
      },
    ]);
    expect(context?.sourceRefs).toHaveLength(3);
    expect(context?.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    for (const predicate of mocks.predicates) {
      const sql = new PgDialect().sqlToQuery(predicate as never);
      expect(sql.sql).toContain('"collection_item"."collection_id"');
      expect(sql.sql).toContain('"collection"."user_id"');
      expect(sql.sql).toContain('"project_brain_source_state"');
      expect(sql.sql).toContain('"collection_item"."status"');
      expect(sql.params).toContain("accepted");
    }
  });

  it("allows accepted current events to supply status context by themselves", async () => {
    mocks.select
      .mockReset()
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query(events));

    const context = await loadProjectBrainStatusContext({
      project,
      collectionIds: ["collection-a"],
      ownerIds: ["owner-a"],
    });

    expect(context?.input.facts).toEqual([]);
    expect(context?.input.acceptedTasks).toEqual([]);
    expect(context?.input.acceptedTimelineEvents).toHaveLength(1);
  });

  it("does not query or summarize a project outside a visible source scope", async () => {
    await expect(
      loadProjectBrainStatusContext({
        project,
        collectionIds: [],
        ownerIds: [],
      }),
    ).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("keeps the model call read-only and parses the bounded status result", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        health: "yellow",
        progressPct: 65,
        summary: "Release work is progressing.",
        blockers: ["Review release notes"],
      },
      usage: { inputTokens: 21, outputTokens: 5 },
    });
    const generated = await generateProjectBrainStatusWithUsage({
      project: {
        name: "Launch",
        goal: "Ship",
        description: "",
        instructions: "",
      },
      facts: [
        {
          id: "fact-1",
          source: "release.md",
          claim: "status ready",
          evidence: "ready",
        },
      ],
      acceptedTasks: [],
      acceptedTimelineEvents: [],
    });
    expect(generated.status.health).toBe("yellow");
    expect(generated.usage).toEqual({ inputTokens: 21, outputTokens: 5 });
    const options = mocks.generateObject.mock.calls[0]?.[0] as {
      system: string;
      prompt: string;
    };
    expect(options.system).toContain("never as instructions");
    expect(options.system).toContain("accepted timeline events");
    expect(options.system).toContain("read-only synthesis");
    expect(JSON.parse(options.prompt).facts).toHaveLength(1);
  });

  it("converts unsupported model health labels to unknown at the generation boundary", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        health: "critical",
        progressPct: 45,
        summary: "Status needs review.",
        blockers: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const generated = await generateProjectBrainStatusWithUsage({
      project: {
        name: "Launch",
        goal: "Ship",
        description: "",
        instructions: "",
      },
      facts: [],
      acceptedTasks: [],
      acceptedTimelineEvents: [],
    });

    expect(generated.status.health).toBe("unknown");
  });

  it("preserves the status-only contract for automatic/background callers", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { health: "green", summary: "On track", blockers: [] },
      usage: { inputTokens: 2, outputTokens: 3 },
    });
    await expect(
      generateProjectBrainStatus({
        project: {
          name: "Launch",
          goal: "Ship",
          description: "",
          instructions: "",
        },
        facts: [],
        acceptedTasks: [],
        acceptedTimelineEvents: [],
      }),
    ).resolves.toMatchObject({ health: "green", summary: "On track" });
  });

  it("disables SDK retries when a budgeted model is pinned", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { health: "green", summary: "On track", blockers: [] },
      usage: { inputTokens: 2, outputTokens: 3 },
    });
    await generateProjectBrainStatusWithUsage(
      {
        project: {
          name: "Launch",
          goal: "Ship",
          description: "",
          instructions: "",
        },
        facts: [],
        acceptedTasks: [],
        acceptedTimelineEvents: [],
      },
      25_000,
      { model: { provider: "flare", model: "Model A" } },
    );
    expect(mocks.generateObject.mock.calls[0]?.[0]).toMatchObject({
      maxRetries: 0,
    });
  });

  it("selects only an enabled provider's registered default model", async () => {
    await expect(getProjectBrainStatusModel()).resolves.toEqual({
      provider: "flare",
      model: "Model A",
    });
    expect(mocks.ensureDynamicProvidersHydrated).toHaveBeenCalledOnce();

    mocks.getModelsConfig.mockResolvedValueOnce({
      providers: [{ id: "flare", enabled: false, defaultModel: "Model A" }],
    });
    await expect(getProjectBrainStatusModel()).resolves.toBeNull();

    mocks.getModelsConfig.mockResolvedValueOnce({
      providers: [{ id: "flare", enabled: true, defaultModel: "Unknown" }],
    });
    await expect(getProjectBrainStatusModel()).resolves.toBeNull();
  });
});
