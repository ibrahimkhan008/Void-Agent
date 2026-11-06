import "server-only";
import { workflowRunApprovalSchema } from "lib/ai/tools/hitl/workflow-run-approval";
import { workflowRunApprovalRepository } from "lib/db/pg/repositories/workflow-run-approval-repository.pg";
import { workflowRepository } from "lib/db/repository";
import { getWorkflowGraphRevision } from "./workflow-review";
import { assertWorkflowMcpAccess } from "./assert-workflow-mcp-access";

export async function loadApprovedWorkflow(input: {
  userId: string | undefined;
  workflowId: string;
  workflowName: string;
  approvalTokenField: string;
  approvalToken: unknown;
  payload: unknown;
}) {
  const approvalBase = {
    platform: "saved-workflow",
    target: input.workflowId,
    workflowName: input.workflowName,
    approvalTokenField: input.approvalTokenField,
    payload: input.payload,
  };
  if (!input.userId || typeof input.approvalToken !== "string") {
    throw new Error("Saved workflow execution requires approval of its exact input.");
  }

  const executable = await workflowRepository.selectExecuteAbility(input.userId);
  const currentWorkflow = executable.find((workflow) => workflow.id === input.workflowId);
  if (!currentWorkflow || currentWorkflow.name !== input.workflowName) {
    throw new Error("This workflow is no longer published or available to your account.");
  }

  const workflow = await workflowRepository.selectStructureById(input.workflowId, { ignoreNote: true });
  if (!workflow || workflow.name !== input.workflowName || !workflow.isPublished) {
    throw new Error("This workflow changed or is no longer available. Review it again before running.");
  }

  const graphRevision = getWorkflowGraphRevision(workflow.nodes, workflow.edges);
  await assertWorkflowMcpAccess(input.userId, workflow.nodes);
  const approval = workflowRunApprovalSchema.safeParse({ ...approvalBase, graphRevision });
  if (!approval.success) throw new Error("Saved workflow approval is invalid.");

  const consumed = await workflowRunApprovalRepository.consume(input.userId, input.approvalToken, approval.data);
  if (!consumed) throw new Error("Saved workflow approval is missing, expired, changed, or already used.");
  return workflow;
}
