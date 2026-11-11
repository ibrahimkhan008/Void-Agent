import "server-only";

import { getSession } from "auth/server";
import {
  WorkflowExecutionEffectSchema,
  WorkflowExecutionProgressSchema,
} from "lib/ai/workflow/execution-state";
import {
  requireExecutableWorkflow,
  toWorkflowEffectReview,
} from "lib/ai/workflow/run-saved-workflow";
import { workflowExecutionRepository } from "lib/db/pg/repositories/workflow-execution-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  _request: Request,
  context: { params: Promise<{ executionId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const rate = await checkApiRateLimit({
    kind: "workflow-execution-history-detail",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { executionId } = await context.params;
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    return NextResponse.json(
      { error: "Invalid execution ID" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const execution = await workflowExecutionRepository.getHistoryForUser(
      session.user.id,
      executionId,
    );
    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const progress = WorkflowExecutionProgressSchema.safeParse(
      execution.progress,
    );
    const expired = execution.expiresAt.getTime() <= Date.now();
    let pendingEffect: ReturnType<typeof toWorkflowEffectReview> | null = null;
    let canApprove = false;

    if (!expired && execution.status === "awaiting_approval") {
      const active = await workflowExecutionRepository.getActiveForUser(
        session.user.id,
        executionId,
      );
      const effect = WorkflowExecutionEffectSchema.safeParse(
        active?.pendingEffect,
      );
      if (effect.success) {
        pendingEffect = toWorkflowEffectReview(effect.data);
        try {
          await requireExecutableWorkflow(
            session.user.id,
            execution.workflowId,
            execution.workflowName,
            execution.graphRevision,
          );
          canApprove = true;
        } catch {
          // An owner can still inspect or reject their paused run if the
          // workflow was unpublished or its connected permissions changed.
        }
      }
    }

    return NextResponse.json(
      {
        execution: {
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflowName,
          status: execution.status,
          completedNodeCount: progress.success
            ? Object.keys(progress.data.completedNodes).length
            : 0,
          createdAt: execution.createdAt,
          updatedAt: execution.updatedAt,
          expiresAt: execution.expiresAt,
          expired,
          pendingEffect,
          canApprove,
          canReject: Boolean(pendingEffect),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workflow execution is unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
