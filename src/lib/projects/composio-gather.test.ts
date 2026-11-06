import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModel: vi.fn(),
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
  },
}));
vi.mock("lib/ai/composio", () => ({
  executeComposioReadAction: mocks.execute,
  isReadOnlyComposioAction: mocks.isReadOnly,
}));

import { gatherComposioProjectSource } from "./composio-gather";

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
      };
    });
  });

  it("exposes only current allowlisted read actions and captures their bounded result", async () => {
    const source = await gatherComposioProjectSource({
      userId: "owner-1",
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
        connectedAccountId: "account-1",
        allowedActionSlugs: [readAction.slug],
        catalog: [readAction] as any,
        project: { name: "Void" },
      }),
    ).rejects.toThrow("no usable data");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
