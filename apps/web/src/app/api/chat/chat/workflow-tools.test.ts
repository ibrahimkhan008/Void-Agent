import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTool: vi.fn((options: unknown) => options),
  loadApprovedWorkflow: vi.fn(),
  startSavedWorkflowExecution: vi.fn(),
  selectToolByIds: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: mocks.createTool }));
vi.mock("lib/ai/workflow/load-approved-workflow", () => ({
  loadApprovedWorkflow: (...args: unknown[]) =>
    mocks.loadApprovedWorkflow(...args),
}));
vi.mock("lib/ai/workflow/run-saved-workflow", () => ({
  startSavedWorkflowExecution: (...args: unknown[]) =>
    mocks.startSavedWorkflowExecution(...args),
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectToolByIds: (...args: unknown[]) => mocks.selectToolByIds(...args),
  },
}));
vi.mock("lib/json-schema-to-zod", () => ({
  jsonSchemaToZod: (schema: unknown) => schema,
}));

import { workflowToVercelAITool } from "./workflow-tools";

const definition = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Publish release",
  description: "Push a release",
  schema: {
    type: "object" as const,
    properties: { version: { type: "string" as const } },
    required: ["version"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadApprovedWorkflow.mockResolvedValue({
    ...definition,
    isPublished: true,
    nodes: [],
    edges: [],
  });
  mocks.startSavedWorkflowExecution.mockImplementation(async (input: any) => {
    input.onProgress([{ id: "node-1", name: "Publish", status: "running" }]);
    return {
      status: "success",
      executionId: "exec-1",
      history: [{ id: "node-1", name: "Publish", status: "success" }],
      result: { published: true },
    };
  });
});

describe("saved workflow chat tool", () => {
  it("requires the reserved approval field and starts the durable runner with the approved payload", async () => {
    const dataStream = { write: vi.fn() };
    const caller = { userId: "user-1" };
    const tool = workflowToVercelAITool({
      ...definition,
      dataStream: dataStream as never,
      caller,
    });
    const options = mocks.createTool.mock.calls[0]?.[0] as any;
    const approvalField = Object.keys(options.inputSchema.properties).find(
      (key) => key.startsWith("voidAgentWorkflowApprovalToken"),
    );
    expect(approvalField).toBeTruthy();
    expect(options.inputSchema.required).toContain(approvalField);
    expect(options.description).toContain("proposeWorkflowRun");

    const result = await (tool as any).execute(
      { version: "1.2.3", [approvalField!]: "one-use-token" },
      { toolCallId: "call-1", abortSignal: undefined },
    );

    expect(mocks.loadApprovedWorkflow).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: definition.id,
      workflowName: definition.name,
      approvalTokenField: approvalField,
      approvalToken: "one-use-token",
      payload: { version: "1.2.3" },
    });
    expect(mocks.startSavedWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workflowName: definition.name,
        executionInput: { version: "1.2.3" },
      }),
    );
    expect(dataStream.write).toHaveBeenCalledTimes(1);
    expect(dataStream.write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolCallId: "call-1",
        providerExecuted: true,
        preliminary: true,
        output: expect.objectContaining({
          status: "running",
          history: [{ id: "node-1", name: "Publish", status: "running" }],
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "success",
      executionId: "exec-1",
      result: { published: true },
    });
  });

  it("does not execute without a caller identity or token", async () => {
    const tool = workflowToVercelAITool({
      ...definition,
      dataStream: { write: vi.fn() } as never,
    });
    const approvalField = Object.keys(
      (mocks.createTool.mock.calls[0]?.[0] as any).inputSchema.properties,
    ).find((key) => key.startsWith("voidAgentWorkflowApprovalToken"))!;

    await (tool as any).execute(
      { version: "1.2.3", [approvalField]: undefined },
      { toolCallId: "call-2", abortSignal: undefined },
    );

    expect(mocks.loadApprovedWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined, approvalToken: undefined }),
    );
    expect(mocks.startSavedWorkflowExecution).not.toHaveBeenCalled();
  });
});
