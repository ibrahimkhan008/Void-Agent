import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  getPinnedModel: vi.fn(),
}));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: vi
      .fn()
      .mockResolvedValue({ id: "test-model" }),
    getModelAsync: mocks.getPinnedModel,
  },
}));

import {
  findBrainPageDuplicateCandidates,
  judgeBrainPageDuplicateCandidates,
  judgeBrainPageDuplicateCandidatesWithUsage,
} from "./brain-page-duplicate-candidates";

const page = (
  id: string,
  title: string,
  entityType = "person",
  aliases: string[] = [],
  salience = 0,
) => ({
  id,
  title,
  entityType,
  normalizedTitle: title.toLowerCase(),
  aliases,
  salience,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPinnedModel.mockResolvedValue({ id: "pinned-model" });
});

describe("findBrainPageDuplicateCandidates", () => {
  it("finds same-type similar names and puts the higher-salience page first", () => {
    const results = findBrainPageDuplicateCandidates([
      page("a", "Riya Shah", "person", [], 0.5),
      page("b", "Riya Sha", "person", [], 2),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      firstPageId: "b",
      secondPageId: "a",
      reason: "similar-title",
    });
  });

  it("finds shared aliases and title-to-alias matches with explicit reasons", () => {
    const results = findBrainPageDuplicateCandidates([
      page("a", "Riya Shah", "person", ["R. Shah"]),
      page("b", "Riya S.", "person", ["R. Shah"]),
      page("c", "R. Shah", "person"),
    ]);
    expect(
      results.some((candidate) => candidate.reason === "shared-alias"),
    ).toBe(true);
    expect(
      results.some((candidate) => candidate.reason === "alias-title-match"),
    ).toBe(true);
  });

  it("does not suggest cross-type or clearly unrelated identities and is bounded", () => {
    const unrelated = [
      page("a", "Riya Shah"),
      page("b", "Acme Incorporated", "organization"),
      page("c", "Quantum Mechanics", "topic"),
    ];
    expect(findBrainPageDuplicateCandidates(unrelated)).toEqual([]);

    const pages = Array.from({ length: 12 }, (_, index) =>
      page(`p-${index}`, `Avery North ${index}`, "person", ["A. North"]),
    );
    expect(findBrainPageDuplicateCandidates(pages)).toHaveLength(20);
  });

  it("never returns candidates when the caller sets a zero limit", () => {
    expect(
      findBrainPageDuplicateCandidates(
        [page("a", "Riya Shah"), page("b", "Riya Sha")],
        0,
      ),
    ).toEqual([]);
  });

  it("bounds model evidence and ignores duplicate or out-of-range judgments", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        decisions: [
          {
            candidateIndex: 0,
            verdict: "same_entity",
            explanation: "Evidence aligns.",
          },
          {
            candidateIndex: 0,
            verdict: "distinct_entities",
            explanation: "Duplicate index.",
          },
          {
            candidateIndex: 8,
            verdict: "same_entity",
            explanation: "Unknown pair.",
          },
        ],
      },
    });
    const firstFacts = Array.from({ length: 10 }, (_, index) => ({
      claim: `Claim ${index}`,
      evidence: `Evidence ${index}`,
    }));

    const result = await judgeBrainPageDuplicateCandidates([
      {
        firstPageId: "page-a",
        firstTitle: "Riya Shah",
        firstType: "person",
        firstAliases: ["R. Shah"],
        firstFacts,
        secondPageId: "page-b",
        secondTitle: "Riya S.",
        secondType: "person",
        secondAliases: [],
        secondFacts: [
          { claim: "Works at Example", evidence: "Riya works at Example." },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        firstPageId: "page-a",
        secondPageId: "page-b",
        verdict: "same_entity",
        explanation: "Evidence aligns.",
      },
    ]);
    const input = mocks.generateObject.mock.calls[0]?.[0] as {
      prompt: string;
      system: string;
    };
    expect(input.system).toContain("untrusted source data");
    const prompt = JSON.parse(input.prompt) as Array<{
      first: { facts: Array<{ claim: string }> };
    }>;
    expect(prompt[0]?.first.facts).toHaveLength(8);
  });

  it("pins budgeted judgments and disables provider retries", async () => {
    mocks.generateObject.mockResolvedValue({
      object: { decisions: [] },
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    const result = await judgeBrainPageDuplicateCandidatesWithUsage(
      [
        {
          firstPageId: "page-a",
          firstTitle: "A",
          firstType: "person",
          firstAliases: [],
          firstFacts: [],
          secondPageId: "page-b",
          secondTitle: "B",
          secondType: "person",
          secondAliases: [],
          secondFacts: [],
        },
      ],
      { model: { provider: "flare", model: "Model A" } },
    );

    expect(result).toEqual({
      judgments: [],
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    expect(mocks.getPinnedModel).toHaveBeenCalledWith({
      provider: "flare",
      model: "Model A",
    });
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: { id: "pinned-model" }, maxRetries: 0 }),
    );
  });
});
