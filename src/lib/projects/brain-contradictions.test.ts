import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  getModel: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: async () => ({ model: "test" }),
    getModelAsync: mocks.getModel,
  },
}));

import {
  type ProjectBrainClaim,
  findProjectBrainConflictCandidates,
  judgeProjectBrainConflictCandidates,
  judgeProjectBrainConflictCandidatesWithUsage,
} from "./brain-contradictions";

const claim = (
  overrides: Partial<ProjectBrainClaim> = {},
): ProjectBrainClaim => ({
  id: "fact-a",
  sourceItemId: "source-a",
  subject: "Project Aurora",
  predicate: "status",
  object: "active",
  evidence: "The project is active.",
  ...overrides,
});

describe("project brain contradiction classification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only compares differing values across separate source items with matching claim keys", () => {
    const fresh = claim({
      id: "fresh",
      sourceItemId: "new-source",
      object: "paused",
    });
    const candidates = findProjectBrainConflictCandidates(
      [fresh],
      [
        claim({
          id: "same-source",
          sourceItemId: "new-source",
          object: "active",
        }),
        claim({ id: "same-value", object: " PAUSED " }),
        claim({
          id: "other-subject",
          subject: "Project Vega",
          object: "cancelled",
        }),
        claim({ id: "other-key", predicate: "owner", object: "Riya" }),
        claim({ id: "eligible", object: "active" }),
      ],
    );

    expect(candidates).toHaveLength(1);
    expect([candidates[0]?.first.id, candidates[0]?.second.id]).toEqual([
      "eligible",
      "fresh",
    ]);
  });

  it("bounds candidate generation and canonicalizes pair order", () => {
    const fresh = [
      claim({ id: "z-new", sourceItemId: "new", object: "one" }),
      claim({ id: "y-new", sourceItemId: "new", object: "two" }),
    ];
    const old = [
      claim({ id: "a-old", object: "old-a" }),
      claim({ id: "b-old", object: "old-b" }),
    ];
    const candidates = findProjectBrainConflictCandidates(fresh, old, 1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.first.id).toBe("a-old");
    expect(findProjectBrainConflictCandidates(fresh, old, 0)).toEqual([]);
  });

  it("limits noisy candidate pairs per page and predicate", () => {
    const incoming = Array.from({ length: 8 }, (_, index) =>
      claim({
        id: `new-${index}`,
        sourceItemId: "new-source",
        subjectPageId: "page-1",
        object: `new-${index}`,
      }),
    );
    const existing = Array.from({ length: 8 }, (_, index) =>
      claim({
        id: `old-${index}`,
        sourceItemId: `source-${index}`,
        subjectPageId: "page-1",
        object: `old-${index}`,
      }),
    );

    expect(
      findProjectBrainConflictCandidates(incoming, existing, 500),
    ).toHaveLength(3);
  });

  it("accepts only unique in-range model judgments and preserves the pair mapping", async () => {
    const candidate = {
      first: claim({ id: "fact-1" }),
      second: claim({
        id: "fact-2",
        sourceItemId: "source-b",
        object: "paused",
      }),
      pageId: null,
    };
    mocks.generateObject.mockResolvedValue({
      object: {
        decisions: [
          {
            candidateIndex: 0,
            verdict: "contradiction",
            explanation: "The states conflict.",
          },
          {
            candidateIndex: 0,
            verdict: "compatible",
            explanation: "Duplicate decision.",
          },
          {
            candidateIndex: 4,
            verdict: "unknown",
            explanation: "Invalid index.",
          },
        ],
      },
    });

    await expect(
      judgeProjectBrainConflictCandidates([candidate]),
    ).resolves.toEqual([
      {
        candidate,
        verdict: "contradiction",
        explanation: "The states conflict.",
      },
    ]);
    expect(mocks.generateObject).toHaveBeenCalledOnce();
  });

  it("does not call a model when there are no candidates", async () => {
    await expect(judgeProjectBrainConflictCandidates([])).resolves.toEqual([]);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("pins a requested model and returns usage for budget settlement", async () => {
    const candidate = {
      first: claim({ id: "fact-1" }),
      second: claim({
        id: "fact-2",
        sourceItemId: "source-b",
        object: "paused",
      }),
      pageId: null,
    };
    const usage = { inputTokens: 31, outputTokens: 7 };
    mocks.getModel.mockResolvedValue({ model: "pinned" });
    mocks.generateObject.mockResolvedValue({
      object: { decisions: [] },
      usage,
    });

    const result = await judgeProjectBrainConflictCandidatesWithUsage(
      [candidate],
      { model: { provider: "provider", model: "Model A" } },
    );

    expect(result).toEqual({ judgments: [], usage });
    expect(mocks.getModel).toHaveBeenCalledWith({
      provider: "provider",
      model: "Model A",
    });
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: { model: "pinned" } }),
    );
  });
});
