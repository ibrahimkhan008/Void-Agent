import "server-only";
import { UIMessageStreamWriter, tool as createTool } from "ai";
import { ChatMention } from "app-types/chat";
import { ObjectJsonSchema7 } from "app-types/util";
import {
  VercelAIWorkflowTool,
  VercelAIWorkflowToolStreaming,
  VercelAIWorkflowToolStreamingResultTag,
  VercelAIWorkflowToolTag,
} from "app-types/workflow";
import { getWorkflowApprovalTokenField } from "lib/ai/tools/hitl/workflow-run-approval";
import type { WorkflowExecutionInput } from "lib/ai/workflow/execution-state";
import type { WorkflowCaller } from "lib/ai/workflow/executor/graph-store";
import { loadApprovedWorkflow } from "lib/ai/workflow/load-approved-workflow";
import { startSavedWorkflowExecution } from "lib/ai/workflow/run-saved-workflow";
import { workflowRepository } from "lib/db/repository";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { errorToString } from "lib/utils";
import { safe } from "ts-safe";

export const workflowToVercelAITool = ({
  id,
  description,
  schema,
  dataStream,
  name,
  caller,
}: {
  id: string;
  name: string;
  description?: string;
  schema: ObjectJsonSchema7;
  dataStream: UIMessageStreamWriter;
  caller?: WorkflowCaller;
}): VercelAIWorkflowTool => {
  const toolName = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();

  const approvalTokenField = getWorkflowApprovalTokenField(
    schema.properties ?? {},
  );
  const toolSchema: ObjectJsonSchema7 = {
    ...schema,
    properties: {
      ...(schema.properties ?? {}),
      [approvalTokenField]: {
        type: "string" as const,
        minLength: 40,
        maxLength: 128,
        description: "One-use approval token returned by proposeWorkflowRun",
      },
    },
    required: [...new Set([...(schema.required ?? []), approvalTokenField])],
  };
  const tool = createTool({
    description: `${name} (workflowId ${id}). Before running, call proposeWorkflowRun with platform saved-workflow, target ${id}, workflowName ${name}, approvalTokenField ${approvalTokenField}, and the exact input payload. Pass the returned one-use token under ${approvalTokenField}. The workflow is rechecked for publication, ownership, graph changes and MCP access before execution. ${description?.trim().slice(0, 50) ?? ""}`,
    inputSchema: jsonSchemaToZod(toolSchema),
    async execute(query, options) {
      const { toolCallId, abortSignal } = options;
      const { [approvalTokenField]: approvalToken, ...workflowInput } =
        query as Record<string, unknown>;
      const history: VercelAIWorkflowToolStreaming[] = [];
      const toolResult = VercelAIWorkflowToolStreamingResultTag.create({
        toolCallId,
        workflowName: name,

        startedAt: Date.now(),
        endedAt: Date.now(),
        history,
        result: undefined,
        status: "running",
      });
      const emitProgress = () =>
        dataStream.write({
          type: "tool-output-available",
          toolCallId,
          output: VercelAIWorkflowToolStreamingResultTag.create({
            ...toolResult,
            history: toolResult.history.map((item) => ({
              ...item,
              error: item.error ? { ...item.error } : undefined,
              result: item.result ? { ...item.result } : undefined,
            })),
          }),
          providerExecuted: true,
          preliminary: true,
        });
      try {
        const userId = caller?.userId;
        const workflow = await loadApprovedWorkflow({
          userId,
          workflowId: id,
          workflowName: name,
          approvalTokenField,
          approvalToken,
          payload: workflowInput,
        });
        if (!userId) throw new Error("Workflow execution requires an account.");
        toolResult.workflowIcon = workflow.icon;
        const outcome = await startSavedWorkflowExecution({
          userId,
          workflow,
          workflowName: name,
          executionInput: workflowInput as WorkflowExecutionInput,
          workflowIcon: workflow.icon,
          abortSignal,
          onProgress: (nextHistory) => {
            toolResult.history = nextHistory;
            emitProgress();
          },
        });
        toolResult.endedAt = Date.now();
        toolResult.status = outcome.status;
        toolResult.executionId = outcome.executionId;
        toolResult.pendingEffect =
          "pendingEffect" in outcome ? outcome.pendingEffect : undefined;
        toolResult.error = "error" in outcome ? outcome.error : undefined;
        toolResult.history = outcome.history;
        toolResult.result = "result" in outcome ? outcome.result : undefined;
        return toolResult;
      } catch (error) {
        return {
          error: {
            name: error instanceof Error ? error.name : "ERROR",
            message: errorToString(error),
            history,
          },
        };
      }
    },
  }) as VercelAIWorkflowTool;

  tool._workflowId = id;
  tool._originToolName = name;
  tool._toolName = toolName;

  return VercelAIWorkflowToolTag.create(tool);
};

export const workflowToVercelAITools = (
  workflows: {
    id: string;
    name: string;
    description?: string;
    schema: ObjectJsonSchema7;
  }[],
  dataStream: UIMessageStreamWriter,
  caller?: WorkflowCaller,
) => {
  return workflows
    .map((v) =>
      workflowToVercelAITool({
        ...v,
        dataStream,
        caller,
      }),
    )
    .reduce(
      (prev, cur) => {
        prev[cur._toolName] = cur;
        return prev;
      },
      {} as Record<string, VercelAIWorkflowTool>,
    );
};

export const loadWorkFlowTools = (opt: {
  mentions?: ChatMention[];
  dataStream: UIMessageStreamWriter;
  caller?: WorkflowCaller;
}) =>
  safe(() =>
    opt?.mentions?.length
      ? workflowRepository.selectToolByIds(
          opt?.mentions
            ?.filter((m) => m.type == "workflow")
            .map(
              (v) =>
                (v as Extract<ChatMention, { type: "workflow" }>).workflowId,
            ),
        )
      : [],
  )
    .map((tools) => workflowToVercelAITools(tools, opt.dataStream, opt.caller))
    .orElse({} as Record<string, VercelAIWorkflowTool>);
