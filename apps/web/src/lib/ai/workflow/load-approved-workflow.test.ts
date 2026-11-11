import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectExecuteAbility: vi.fn(),
  selectStructureById: vi.fn(),
  selectAllForUser: vi.fn(),
  consume: vi.fn(),
}));
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({
  workflowRunApprovalRepository: { consume: mocks.consume },
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectExecuteAbility: mocks.selectExecuteAbility,
    selectStructureById: mocks.selectStructureById,
  },
  mcpRepository: { selectAllForUser: mocks.selectAllForUser },
}));
vi.mock("server-only", () => ({}));

import { loadApprovedWorkflow } from "./load-approved-workflow";
import { getWorkflowGraphRevision } from "./workflow-review";

const workflow = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Approved workflow",
  isPublished: true,
  nodes: [],
  edges: [],
};
const input = {
  userId: "user-1",
  workflowId: workflow.id,
  workflowName: workflow.name,
  approvalTokenField: "voidAgentWorkflowApprovalToken",
  approvalToken: "a".repeat(48),
  payload: { customerId: "42", action: "review" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectExecuteAbility.mockResolvedValue([workflow]);
  mocks.selectStructureById.mockResolvedValue(workflow);
  mocks.selectAllForUser.mockResolvedValue([]);
  mocks.consume.mockResolvedValue(true);
});

describe("loadApprovedWorkflow", () => {
  it("rechecks current execute access and consumes the exact input token before returning the graph", async () => {
    await expect(loadApprovedWorkflow(input)).resolves.toBe(workflow);
    expect(mocks.selectExecuteAbility).toHaveBeenCalledWith("user-1");
    expect(mocks.selectStructureById).toHaveBeenCalledWith(workflow.id, {
      ignoreNote: true,
    });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", input.approvalToken, {
      platform: "saved-workflow",
      target: workflow.id,
      workflowName: workflow.name,
      approvalTokenField: input.approvalTokenField,
      payload: input.payload,
      graphRevision: getWorkflowGraphRevision(workflow.nodes, workflow.edges),
    });
  });

  it("fails closed if the workflow is unpublished or no longer executable", async () => {
    mocks.selectExecuteAbility.mockResolvedValue([]);
    await expect(loadApprovedWorkflow(input)).rejects.toThrow(
      "no longer published",
    );
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("fails closed if the workflow name changed after review", async () => {
    mocks.selectStructureById.mockResolvedValue({
      ...workflow,
      name: "Changed",
    });
    await expect(loadApprovedWorkflow(input)).rejects.toThrow(
      "changed or is no longer available",
    );
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("rejects a missing or replayed token before returning executable content", async () => {
    mocks.consume.mockResolvedValue(false);
    await expect(loadApprovedWorkflow(input)).rejects.toThrow(
      "missing, expired, changed, or already used",
    );
  });

  it("does not consume approval or return a graph containing an inaccessible MCP server", async () => {
    mocks.selectStructureById.mockResolvedValue({
      ...workflow,
      nodes: [
        {
          kind: "tool",
          nodeConfig: {
            tool: {
              type: "mcp-tool",
              serverId: "private-server",
              serverName: "Private",
            },
          },
        },
      ],
    });
    mocks.selectAllForUser.mockResolvedValue([]);
    await expect(loadApprovedWorkflow(input)).rejects.toThrow(
      /MCP connection.*unavailable/i,
    );
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
