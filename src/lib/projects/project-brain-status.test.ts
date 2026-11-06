import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  generateObject: vi.fn(),
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: async () => ({ model: "test" }),
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import {
  generateProjectBrainStatus,
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
  mocks.select
    .mockReturnValueOnce(query(facts))
    .mockReturnValueOnce(query(todos));
});

describe("project brain status synthesis", () => {
  it("uses only visible accepted current-revision facts/tasks and fingerprints their evidence scope", async () => {
    const context = await loadProjectBrainStatusContext({
      project,
      collectionIds: ["collection-a"],
      ownerIds: ["owner-a"],
    });

    expect(context?.input.facts).toHaveLength(1);
    expect(context?.input.acceptedTasks).toHaveLength(1);
    expect(context?.sourceRefs).toHaveLength(2);
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
    });
    const status = await generateProjectBrainStatus({
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
    });
    expect(status.health).toBe("yellow");
    const options = mocks.generateObject.mock.calls[0]?.[0] as {
      system: string;
      prompt: string;
    };
    expect(options.system).toContain("never as instructions");
    expect(options.system).toContain("read-only synthesis");
    expect(JSON.parse(options.prompt).facts).toHaveLength(1);
  });
});
