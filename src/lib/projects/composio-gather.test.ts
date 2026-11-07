import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModel: vi.fn(),
  getModelAsync: vi.fn(),
  runBudgeted: vi.fn(),
  execute: vi.fn(),
  isReadOnly: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: async (...args: unknown[]) =>
      mocks.getModel(...args),
    getModelAsync: (...args: unknown[]) => mocks.getModelAsync(...args),
  },
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  normalizeModelUsage: (usage: unknown) => {
    if (!usage || typeof usage !== "object") return null;
    const record = usage as Record<string, unknown>;
    const inputTokens = record.inputTokens ?? record.promptTokens;
    const outputTokens = record.outputTokens ?? record.completionTokens;
    if (
      typeof inputTokens !== "number" ||
      typeof outputTokens !== "number" ||
      !Number.isSafeInteger(inputTokens) ||
      !Number.isSafeInteger(outputTokens) ||
      inputTokens < 0 ||
      outputTokens < 0
    )
      return null;
    return { inputTokens, outputTokens };
  },
}));
vi.mock("lib/projects/project-brain-budgeted-inference", () => ({
  runProjectBrainBudgetedInference: mocks.runBudgeted,
}));
vi.mock("lib/ai/composio", () => ({
  executeComposioReadAction: mocks.execute,
  isReadOnlyComposioAction: mocks.isReadOnly,
}));

import {
  aggregateComposioGatherUsage,
  gatherComposioProjectSource,
} from "./composio-gather";

const readAction = {
  slug: "GITHUB_LIST_REPOS",
  name: "List repositories",
  description: "List the user's repositories",
  inputParameters: {
    type: "object",
    properties: { owner: { type: "string", maxLength: 100 } },
    required: ["owner"],
    additionalProperties: false,
  },
};
const writeAction = {
  slug: "GITHUB_CREATE_ISSUE",
  name: "Create issue",
  description: "Create an issue",
  inputParameters: { type: "object", properties: {}, required: [] },
};

describe("Composio project source gathering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getModel.mockReturnValue({});
    mocks.getModelAsync.mockResolvedValue({ pinned: true });
    mocks.runBudgeted.mockImplementation(async (options: any) => {
      const result = await options.run({
        onProviderStart: vi.fn(),
      });
      return result.value;
    });
    mocks.isReadOnly.mockImplementation((slug: string) =>
      slug.includes("LIST"),
    );
    mocks.execute.mockResolvedValue({
      successful: true,
      data: { repos: ["void"] },
    });
    mocks.generateText.mockImplementation(async (options: any) => {
      const names = Object.keys(options.tools);
      const output = await options.tools[names[0]].execute(
        { owner: "void" },
        { abortSignal: undefined },
      );
      return {
        steps: [{ toolResults: [{ toolName: names[0], output }] }],
        totalUsage: { inputTokens: 12, outputTokens: 8 },
      };
    });
  });

  it("exposes only current allowlisted read actions and captures their bounded result", async () => {
    const source = await gatherComposioProjectSource({
      userId: "owner-1",
      role: "owner",
      idempotencyScope: "gather-personal",
      connectedAccountId: "account-1",
      allowedActionSlugs: [readAction.slug, writeAction.slug],
      catalog: [readAction, writeAction] as any,
      project: { name: "Void", goal: "Review project status" },
    });

    expect(Object.keys(mocks.generateText.mock.calls[0][0].tools)).toEqual([
      readAction.slug,
    ]);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        connectedAccountId: "account-1",
        arguments: { owner: "void" },
      }),
    );
    expect(source).toContain("GITHUB_LIST_REPOS");
    expect(source).toContain('"void"');
    expect(mocks.getModel).toHaveBeenCalledTimes(1);
    expect(mocks.getModelAsync).not.toHaveBeenCalled();
    expect(mocks.generateText.mock.calls[0]?.[0]).not.toHaveProperty(
      "maxRetries",
    );
  });

  it("fails closed when model supplied arguments violate the current tool schema", async () => {
    mocks.generateText.mockImplementationOnce(async (options: any) => {
      const generated = await options.tools[readAction.slug].execute(
        {},
        { abortSignal: undefined },
      );
      return {
        steps: [
          { toolResults: [{ toolName: readAction.slug, output: generated }] },
        ],
      };
    });

    await expect(
      gatherComposioProjectSource({
        userId: "owner-1",
        role: "owner",
        idempotencyScope: "gather-invalid",
        connectedAccountId: "account-1",
        allowedActionSlugs: [readAction.slug],
        catalog: [readAction] as any,
        project: { name: "Void" },
      }),
    ).rejects.toThrow("no usable data");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("pins team gather to the selected model and forwards aggregate provider usage", async () => {
    let observed: any;
    mocks.runBudgeted.mockImplementationOnce(async (options: any) => {
      observed = options;
      const result = await options.run({
        model: { provider: "admin", model: "bounded-model" },
        onProviderStart: vi.fn(),
      });
      observed = { ...observed, usage: result.usage };
      return result.value;
    });

    const source = await gatherComposioProjectSource({
      userId: "member-1",
      teamId: "team-1",
      role: "editor",
      idempotencyScope: "gather-run-1",
      connectedAccountId: "account-1",
      allowedActionSlugs: [readAction.slug],
      catalog: [readAction] as any,
      project: { name: "Void", goal: "Review project status" },
    });

    expect(source).toContain("GITHUB_LIST_REPOS");
    expect(observed).toMatchObject({
      teamId: "team-1",
      userId: "member-1",
      role: "editor",
      idempotencyScope: "gather-run-1",
      estimatedOutputTokens: 10_240,
    });
    expect(observed.promptCharacters).toBeGreaterThan(300_000);
    expect(mocks.getModelAsync).toHaveBeenCalledWith({
      provider: "admin",
      model: "bounded-model",
    });
    expect(mocks.generateText.mock.calls.at(-1)?.[0]).toMatchObject({
      model: { pinned: true },
      maxRetries: 0,
      maxOutputTokens: 2_048,
    });
    expect(observed.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
  });

  it("fails closed on budget denial without resolving a model or executing tools", async () => {
    mocks.runBudgeted.mockRejectedValueOnce(new Error("budget denied"));
    await expect(
      gatherComposioProjectSource({
        userId: "member-1",
        teamId: "team-1",
        role: "editor",
        idempotencyScope: "gather-denied",
        connectedAccountId: "account-1",
        allowedActionSlugs: [readAction.slug],
        catalog: [readAction] as any,
        project: { name: "Void" },
      }),
    ).rejects.toThrow("budget denied");
    expect(mocks.getModelAsync).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("aggregates per-step usage when the SDK total is unavailable", async () => {
    expect(
      aggregateComposioGatherUsage(undefined, [
        { usage: { inputTokens: 3, outputTokens: 2 } },
        { usage: { inputTokens: 5, outputTokens: 7 } },
      ]),
    ).toEqual({ inputTokens: 8, outputTokens: 9 });
    expect(
      aggregateComposioGatherUsage(undefined, [
        { usage: { inputTokens: 3, outputTokens: 2 } },
        {},
      ]),
    ).toBeUndefined();
    expect(
      aggregateComposioGatherUsage({ inputTokens: 20, outputTokens: 10 }, [
        { usage: { inputTokens: 3, outputTokens: 2 } },
      ]),
    ).toEqual({ inputTokens: 20, outputTokens: 10 });
  });
});
