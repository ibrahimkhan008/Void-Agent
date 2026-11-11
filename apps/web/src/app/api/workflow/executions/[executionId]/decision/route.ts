import { getSession } from "auth/server";
import { WorkflowExecutionEffectSchema } from "lib/ai/workflow/execution-state";
import {
  WorkflowEffectUncertainError,
  WorkflowExecutionConflictError,
  requireExecutableWorkflow,
  resumeApprovedWorkflowExecution,
} from "lib/ai/workflow/run-saved-workflow";
import { workflowExecutionRepository } from "lib/db/pg/repositories/workflow-execution-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

const EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(
  request: Request,
  context: { params: Promise<{ executionId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const rate = await checkApiRateLimit({
    kind: "workflow-execution-decision",
    id: session.user.id,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const { executionId } = await context.params;
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    return Response.json({ error: "Invalid execution ID" }, { status: 400 });
  }
  const body = await readBoundedJson(request, 8_000);
  if (!body.ok) {
    return Response.json(
      { error: body.tooLarge ? "Request too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400 },
    );
  }
  if (
    body.value === null ||
    typeof body.value !== "object" ||
    Array.isArray(body.value)
  ) {
    return Response.json(
      { error: "Invalid workflow decision" },
      { status: 400 },
    );
  }
  const value = body.value as { effectHash?: unknown; decision?: unknown };
  if (
    typeof value.effectHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.effectHash) ||
    (value.decision !== "approve" && value.decision !== "reject")
  ) {
    return Response.json(
      { error: "Invalid workflow decision" },
      { status: 400 },
    );
  }

  try {
    const pending = await workflowExecutionRepository.getActiveForUser(
      session.user.id,
      executionId,
    );
    if (!pending) return new Response("Execution not found", { status: 404 });
    const effect = WorkflowExecutionEffectSchema.safeParse(
      pending.pendingEffect,
    );
    if (!effect.success || effect.data.hash !== value.effectHash) {
      return Response.json(
        {
          error:
            "The pending effect changed. Review the current request again.",
        },
        { status: 409 },
      );
    }

    if (value.decision === "reject") {
      const cancelled = await workflowExecutionRepository.cancelPendingApproval(
        {
          userId: session.user.id,
          executionId,
          effectHash: value.effectHash,
        },
      );
      if (!cancelled)
        return Response.json({ error: "Execution changed" }, { status: 409 });
      return Response.json(
        { status: "cancelled", executionId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    await requireExecutableWorkflow(
      session.user.id,
      pending.workflowId,
      pending.workflowName,
      pending.graphRevision,
    );
    const approved = await workflowExecutionRepository.approvePendingEffect({
      userId: session.user.id,
      executionId,
      effectHash: value.effectHash,
    });
    if (!approved)
      return Response.json({ error: "Execution changed" }, { status: 409 });
    const result = await resumeApprovedWorkflowExecution({
      userId: session.user.id,
      executionId,
      abortSignal: request.signal,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status =
      error instanceof WorkflowExecutionConflictError
        ? 409
        : error instanceof WorkflowEffectUncertainError
          ? 409
          : 503;
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process this workflow decision.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
