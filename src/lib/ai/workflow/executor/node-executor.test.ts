import { generateText } from "ai";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolNodeData } from "../workflow.interface";
import type { WorkflowRuntimeState } from "./graph-store";
import { toolNodeExecutor } from "./node-executor";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  convertToModelMessages: vi.fn(),
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { toolCall: vi.fn() },
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModelWithFailureFallbackAsync: vi.fn() },
}));
vi.mock("lib/ai/tools/web/web-search", () => ({
  exaContentsToolForWorkflow: { execute: vi.fn() },
  exaSearchToolForWorkflow: { execute: vi.fn() },
}));
vi.mock("lib/ai/tools/web/youtube-search", () => ({
  youtubeSearchToolForWorkflow: { execute: vi.fn() },
}));
vi.mock("lib/ai/tools/web/youtube-transcript", () => ({
  youtubeTranscriptToolForWorkflow: { execute: vi.fn() },
}));

describe("toolNodeExecutor approved effect replay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes exactly the reviewed arguments without regenerating them", async () => {
    const approvedArguments = { recipient: "user@example.test", amount: 42 };
    const toolCall = vi.mocked(mcpClientsManager.toolCall);
    toolCall.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    } as never);
    const generate = vi.mocked(generateText);
    const beforeEffect = vi.fn().mockResolvedValue(undefined);
    const node = {
      id: "a2b79fe0-05c3-41f0-9a76-808075a7aaf1",
      kind: "tool",
      tool: {
        type: "mcp-tool",
        id: "send_payment",
        serverId: "payments",
        serverName: "Payments",
        description: "Send payment",
        parameterSchema: { type: "object", properties: {} },
      },
      model: { provider: "google", model: "Gemini" },
    } as unknown as ToolNodeData;
    const state = {
      edges: [],
      nodes: [],
      query: {},
      getOutput: vi.fn(),
      setInput: vi.fn(),
    } as unknown as WorkflowRuntimeState;

    const result = await toolNodeExecutor({
      node,
      state,
      execution: {
        getApprovedEffect: vi.fn().mockResolvedValue({
          nodeId: node.id,
          kind: "tool",
          target: "mcp:payments/send_payment",
          payload: { arguments: approvedArguments },
          hash: "a".repeat(64),
          started: false,
        }),
        beforeEffect,
      },
    });

    expect(generate).not.toHaveBeenCalled();
    expect(toolCall).toHaveBeenCalledWith(
      "payments",
      "send_payment",
      approvedArguments,
    );
    expect(beforeEffect).toHaveBeenCalledWith({
      nodeId: node.id,
      kind: "tool",
      target: "mcp:payments/send_payment",
      payload: { arguments: approvedArguments },
    });
    expect(result.input).toEqual({ parameter: approvedArguments });
  });
});
