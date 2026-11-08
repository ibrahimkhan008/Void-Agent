import "server-only";

import type {
  VercelAIWorkflowToolStreaming,
  WorkflowIcon,
} from "app-types/workflow";
import {
  type WorkflowExecutionEffect,
  WorkflowExecutionEffectSchema,
  type WorkflowExecutionInput,
  WorkflowExecutionInputSchema,
  WorkflowExecutionProgressSchema,
} from "lib/ai/workflow/execution-state";
import { createWorkflowExecutor } from "lib/ai/workflow/executor/workflow-executor";
import { NodeKind } from "lib/ai/workflow/workflow.interface";
import {
  hashWorkflowExecutionEffect,
  workflowExecutionRepository,
} from "lib/db/pg/repositories/workflow-execution-repository.pg";
import { workflowRepository } from "lib/db/repository";
import { assertWorkflowMcpAccess } from "./assert-workflow-mcp-access";
import { getWorkflowGraphRevision } from "./workflow-review";

const EXECUTION_TTL_MS = 30 * 60_000;

type WorkflowWithGraph = NonNullable<
  Awaited<ReturnType<typeof workflowRepository.selectStructureById>>
>;

export type WorkflowEffectReview = Omit<WorkflowExecutionEffect, "started">;

export class WorkflowEffectApprovalRequiredError extends Error {
  readonly code = "workflow_effect_approval_required";

  constructor(
    readonly executionId: string,
    readonly effect: WorkflowExecutionEffect,
  ) {
    super("This workflow needs approval for its next external action.");
    this.name = "WorkflowEffectApprovalRequiredError";
  }
}

export class WorkflowEffectUncertainError extends Error {
  readonly code = "workflow_effect_uncertain";

  constructor() {
    super(
      "An external action may have completed, but its result was not saved. This execution cannot safely retry that action.",
    );
    this.name = "WorkflowEffectUncertainError";
  }
}

export class WorkflowExecutionConflictError extends Error {
  readonly code = "workflow_execution_conflict";

  constructor(message = "Workflow execution changed. Review it again.") {
    super(message);
    this.name = "WorkflowExecutionConflictError";
  }
}

function hasSensitiveKey(key: string) {
  return /(?:api[_-]?key|authorization|token|secret|password|passwd|credential|cookie)/iu.test(
    key,
  );
}

function redactReviewValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => redactReviewValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          hasSensitiveKey(key)
            ? "[redacted]"
            : redactReviewValue(item, depth + 1),
        ]),
    );
  }
  if (typeof value === "string") {
    if (value.length > 4_000) return `${value.slice(0, 4_000)}…[truncated]`;
    return value;
  }
  return value;
}

function redactTarget(kind: WorkflowExecutionEffect["kind"], target: string) {
  if (kind !== "http") return target;
  try {
    const url = new URL(target);
    url.username = "";
    url.password = "";
    for (const key of url.searchParams.keys()) {
      if (hasSensitiveKey(key)) url.searchParams.set(key, "[redacted]");
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "Invalid HTTP target";
  }
}

export function toWorkflowEffectReview(
  effect: WorkflowExecutionEffect,
): WorkflowEffectReview {
  return {
    nodeId: effect.nodeId,
    kind: effect.kind,
    target: redactTarget(effect.kind, effect.target),
    payload: redactReviewValue(effect.payload) as Record<string, unknown>,
    hash: effect.hash,
  };
}

export async function requireExecutableWorkflow(
  userId: string,
  workflowId: string,
  workflowName: string,
  expectedRevision?: string,
): Promise<WorkflowWithGraph> {
  const accessible = await workflowRepository.selectExecuteAbility(userId);
  if (
    !accessible.some(
      (workflow) =>
        workflow.id === workflowId && workflow.name === workflowName,
    )
  ) {
    throw new Error("Workflow is no longer available to this user.");
  }
  const workflow = await workflowRepository.selectStructureById(workflowId, {
    ignoreNote: true,
  });
  if (!workflow || !workflow.isPublished || workflow.name !== workflowName) {
    throw new Error("Workflow is no longer published or available.");
  }
  const currentRevision = getWorkflowGraphRevision(
    workflow.nodes,
    workflow.edges,
  );
  if (expectedRevision && currentRevision !== expectedRevision) {
    throw new WorkflowExecutionConflictError(
      "Workflow changed while it was paused. Review it again before resuming.",
    );
  }
  await assertWorkflowMcpAccess(userId, workflow.nodes);
  return workflow;
}

function makeExecutionEffectHook(userId: string, executionId: string) {
  return async (candidate: {
    nodeId: string;
    kind: "llm" | "http" | "tool";
    target: string;
    payload: Record<string, unknown>;
  }) => {
    const effectBase = {
      nodeId: candidate.nodeId,
      kind: candidate.kind,
      target: candidate.target,
      payload: candidate.payload,
    };
    const effect = WorkflowExecutionEffectSchema.parse({
      ...effectBase,
      hash: hashWorkflowExecutionEffect(effectBase),
      started: false,
    });
    const execution = await workflowExecutionRepository.getForUser(
      userId,
      executionId,
    );
    if (!execution)
      throw new WorkflowExecutionConflictError(
        "Execution expired or is unavailable.",
      );

    if (execution.status === "awaiting_approval") {
      const pending = WorkflowExecutionEffectSchema.safeParse(
        execution.pendingEffect,
      );
      if (pending.success && pending.data.hash === effect.hash) {
        throw new WorkflowEffectApprovalRequiredError(
          executionId,
          pending.data,
        );
      }
      throw new WorkflowExecutionConflictError(
        "Another workflow effect is awaiting approval.",
      );
    }
    if (execution.status === "effect_uncertain") {
      throw new WorkflowEffectUncertainError();
    }
    if (execution.status !== "running") {
      throw new WorkflowExecutionConflictError(
        "This workflow execution is no longer active.",
      );
    }

    const approved = WorkflowExecutionEffectSchema.safeParse(
      execution.approvedEffect,
    );
    if (approved.success) {
      if (approved.data.hash !== effect.hash) {
        throw new WorkflowExecutionConflictError(
          "The approved workflow effect no longer matches.",
        );
      }
      if (approved.data.started) {
        await workflowExecutionRepository.markEffectUncertain({
          userId,
          executionId,
          error:
            "A previously started effect was encountered again before its checkpoint was saved.",
        });
        throw new WorkflowEffectUncertainError();
      }
      const started =
        await workflowExecutionRepository.markApprovedEffectStarted({
          userId,
          executionId,
          effectHash: effect.hash,
        });
      if (!started) throw new WorkflowExecutionConflictError();
      return;
    }

    const pending = await workflowExecutionRepository.requestEffectApproval({
      userId,
      executionId,
      effect: effectBase,
    });
    if (pending)
      throw new WorkflowEffectApprovalRequiredError(executionId, effect);
    const latest = await workflowExecutionRepository.getForUser(
      userId,
      executionId,
    );
    const currentPending = WorkflowExecutionEffectSchema.safeParse(
      latest?.pendingEffect,
    );
    if (latest?.status === "awaiting_approval" && currentPending.success) {
      if (currentPending.data.hash === effect.hash) {
        throw new WorkflowEffectApprovalRequiredError(
          executionId,
          currentPending.data,
        );
      }
      throw new WorkflowExecutionConflictError(
        "Another workflow effect is awaiting approval.",
      );
    }
    throw new WorkflowExecutionConflictError();
  };
}

function makeExecutionHistory(
  workflow: WorkflowWithGraph,
  executionId: string,
  userId: string,
  input: WorkflowExecutionInput,
  progress: unknown,
  onProgress?: (history: VercelAIWorkflowToolStreaming[]) => void,
) {
  const parsedProgress = WorkflowExecutionProgressSchema.parse(progress);
  const history: VercelAIWorkflowToolStreaming[] = [];
  const executor = createWorkflowExecutor({
    nodes: workflow.nodes,
    edges: workflow.edges,
    execution: {
      completedNodes: parsedProgress.completedNodes,
      beforeEffect: makeExecutionEffectHook(userId, executionId),
      getApprovedEffect: async (nodeId) => {
        const execution = await workflowExecutionRepository.getForUser(
          userId,
          executionId,
        );
        if (execution?.status !== "running") return null;
        const effect = WorkflowExecutionEffectSchema.safeParse(
          execution.approvedEffect,
        );
        return effect.success && effect.data.nodeId === nodeId
          ? effect.data
          : null;
      },
      onNodeCheckpoint: async (nodeId, checkpoint) => {
        const stored = await workflowExecutionRepository.checkpoint({
          userId,
          executionId,
          nodeId,
          checkpoint,
        });
        if (!stored)
          throw new WorkflowExecutionConflictError(
            "Execution stopped before its checkpoint could be saved.",
          );
      },
    },
  });
  executor.subscribe((event) => {
    if (
      event.eventType === "WORKFLOW_START" ||
      event.eventType === "WORKFLOW_END"
    )
      return;
    if (event.node.name === "SKIP") return;
    if (event.eventType === "NODE_START") {
      const node = workflow.nodes.find((item) => item.id === event.node.name);
      if (!node) return;
      history.push({
        id: event.nodeExecutionId,
        name: node.name,
        status: "running",
        startedAt: event.startedAt,
        kind: node.kind as VercelAIWorkflowToolStreaming["kind"],
      });
    } else if (event.eventType === "NODE_END") {
      const item = history.find((value) => value.id === event.nodeExecutionId);
      if (!item) return;
      item.endedAt = event.endedAt;
      if (event.isOk) {
        item.status = "success";
        item.result = {
          input: event.node.output.getInput(event.node.name),
          output: event.node.output.getOutput({
            nodeId: event.node.name,
            path: [],
          }),
        };
      } else {
        item.status = "fail";
        item.error = {
          name: event.error?.name || "ERROR",
          message: event.error?.message || "Workflow node failed.",
        };
      }
    }
    onProgress?.(history.map((item) => ({ ...item })));
  });
  return { executor, history, input };
}

function finalOutputs(history: VercelAIWorkflowToolStreaming[]) {
  const outputs = history
    .filter((item) => item.kind === NodeKind.Output)
    .map((item) => item.result?.output)
    .filter((item) => item !== undefined && item !== null);
  return outputs.length === 1 ? outputs[0] : outputs;
}

async function runExecution(input: {
  userId: string;
  executionId: string;
  workflow: WorkflowWithGraph;
  executionInput: WorkflowExecutionInput;
  progress: unknown;
  abortSignal?: AbortSignal;
  onProgress?: (history: VercelAIWorkflowToolStreaming[]) => void;
}) {
  const { executor, history } = makeExecutionHistory(
    input.workflow,
    input.executionId,
    input.userId,
    input.executionInput,
    input.progress,
    input.onProgress,
  );
  const abort = () => executor.exit();
  input.abortSignal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await executor.run(
      { query: input.executionInput },
      { disableHistory: true },
    );
    if (result.isOk) {
      await workflowExecutionRepository.finish({
        userId: input.userId,
        executionId: input.executionId,
        status: "completed",
      });
      return {
        status: "success" as const,
        executionId: input.executionId,
        history: history.map((item) => ({ ...item, result: undefined })),
        result: finalOutputs(history),
      };
    }

    const error = result.error;
    if (error instanceof WorkflowEffectApprovalRequiredError) {
      return {
        status: "awaiting_approval" as const,
        executionId: error.executionId,
        pendingEffect: toWorkflowEffectReview(error.effect),
        history: history.map((item) => ({ ...item, result: undefined })),
      };
    }
    if (error instanceof WorkflowEffectUncertainError) {
      return {
        status: "effect_uncertain" as const,
        executionId: input.executionId,
        error: { name: error.name, message: error.message },
        history: history.map((item) => ({ ...item, result: undefined })),
      };
    }

    const current = await workflowExecutionRepository.getForUser(
      input.userId,
      input.executionId,
    );
    const approved = WorkflowExecutionEffectSchema.safeParse(
      current?.approvedEffect,
    );
    if (approved.success && approved.data.started) {
      await workflowExecutionRepository.markEffectUncertain({
        userId: input.userId,
        executionId: input.executionId,
        error:
          "Workflow stopped after an external effect started without saving its result.",
      });
      const uncertain = new WorkflowEffectUncertainError();
      return {
        status: "effect_uncertain" as const,
        executionId: input.executionId,
        error: { name: uncertain.name, message: uncertain.message },
        history: history.map((item) => ({ ...item, result: undefined })),
      };
    }
    if (input.abortSignal?.aborted) {
      await workflowExecutionRepository.finish({
        userId: input.userId,
        executionId: input.executionId,
        status: "cancelled",
      });
      return {
        status: "cancelled" as const,
        executionId: input.executionId,
        history: history.map((item) => ({ ...item, result: undefined })),
      };
    }
    await workflowExecutionRepository.finish({
      userId: input.userId,
      executionId: input.executionId,
      status: "failed",
      error: error?.message || "Workflow failed.",
    });
    return {
      status: "fail" as const,
      executionId: input.executionId,
      error: {
        name: error?.name || "ERROR",
        message: error?.message || "Workflow failed.",
      },
      history: history.map((item) => ({ ...item, result: undefined })),
    };
  } finally {
    input.abortSignal?.removeEventListener("abort", abort);
  }
}

export async function startSavedWorkflowExecution(input: {
  userId: string;
  workflow: WorkflowWithGraph;
  workflowName: string;
  executionInput: WorkflowExecutionInput;
  workflowIcon?: WorkflowIcon;
  abortSignal?: AbortSignal;
  onProgress?: (history: VercelAIWorkflowToolStreaming[]) => void;
}) {
  const workflow = await requireExecutableWorkflow(
    input.userId,
    input.workflow.id,
    input.workflowName,
    getWorkflowGraphRevision(input.workflow.nodes, input.workflow.edges),
  );
  const now = new Date();
  const execution = await workflowExecutionRepository.create({
    userId: input.userId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    graphRevision: getWorkflowGraphRevision(workflow.nodes, workflow.edges),
    input: input.executionInput,
    expiresAt: new Date(now.getTime() + EXECUTION_TTL_MS),
  });
  return {
    workflowIcon: input.workflowIcon ?? workflow.icon,
    ...(await runExecution({
      userId: input.userId,
      executionId: execution.id,
      workflow,
      executionInput: input.executionInput,
      progress: execution.progress,
      abortSignal: input.abortSignal,
      onProgress: input.onProgress,
    })),
  };
}

export async function resumeApprovedWorkflowExecution(input: {
  userId: string;
  executionId: string;
  abortSignal?: AbortSignal;
  onProgress?: (history: VercelAIWorkflowToolStreaming[]) => void;
}) {
  const execution = await workflowExecutionRepository.getForUser(
    input.userId,
    input.executionId,
  );
  if (!execution)
    throw new WorkflowExecutionConflictError(
      "Execution expired or is unavailable.",
    );
  if (execution.status === "effect_uncertain")
    throw new WorkflowEffectUncertainError();
  if (execution.status !== "running")
    throw new WorkflowExecutionConflictError(
      "Execution is not approved for resume.",
    );
  const workflow = await requireExecutableWorkflow(
    input.userId,
    execution.workflowId,
    execution.workflowName,
    execution.graphRevision,
  );
  return {
    workflowIcon: workflow.icon,
    ...(await runExecution({
      userId: input.userId,
      executionId: input.executionId,
      workflow,
      executionInput: WorkflowExecutionInputSchema.parse(execution.input),
      progress: execution.progress,
      abortSignal: input.abortSignal,
      onProgress: input.onProgress,
    })),
  };
}
