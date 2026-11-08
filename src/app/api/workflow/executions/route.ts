import "server-only";

import { getSession } from "auth/server";
import { WorkflowExecutionProgressSchema } from "lib/ai/workflow/execution-state";
import { workflowExecutionRepository } from "lib/db/pg/repositories/workflow-execution-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function summarize(execution: {
  id: string;
  workflowId: string;
  workflowName: string;
  progress: unknown;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  const progress = WorkflowExecutionProgressSchema.safeParse(
    execution.progress,
  );
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    workflowName: execution.workflowName,
    status: execution.status,
    completedNodeCount: progress.success
      ? Object.keys(progress.data.completedNodes).length
      : 0,
    expiresAt: execution.expiresAt,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    expired: execution.expiresAt.getTime() <= Date.now(),
  };
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const rate = await checkApiRateLimit({
    kind: "workflow-execution-history",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const executions = await workflowExecutionRepository.listRecentForUser(
      session.user.id,
      20,
    );
    return NextResponse.json(
      { executions: executions.map(summarize) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workflow execution history is unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
