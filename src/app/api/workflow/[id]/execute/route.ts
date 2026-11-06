import { getSession } from "auth/server";
import { workflowRunApprovalSchema } from "lib/ai/tools/hitl/workflow-run-approval";
import { workflowRunApprovalRepository } from "lib/db/pg/repositories/workflow-run-approval-repository.pg";
import { createUserClient } from "lib/n8n/client";
import { N8nError } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import {
  getN8nRunAcknowledgement,
  getN8nWorkflowRevision,
} from "lib/n8n/workflow-review";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return new Response("Forbidden", { status: 403 });
    }
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id))
    return new Response("Invalid workflow ID", { status: 400 });
  const rate = await checkApiRateLimit({
    kind: "n8n-workflow-execute",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJson(request, 20_000);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const input = body.value as {
    query?: unknown;
    workflowName?: unknown;
    graphRevision?: unknown;
    approvalToken?: unknown;
  };
  const approval = workflowRunApprovalSchema.safeParse({
    platform: "n8n",
    target: id,
    workflowName: input.workflowName,
    graphRevision: input.graphRevision,
    payload: input.query,
  });
  if (!approval.success || typeof input.approvalToken !== "string")
    return new Response("A current workflow review approval is required", {
      status: 403,
    });

  try {
    const n8nUser = await ensureN8nUser(session);
    const client = createUserClient(
      n8nUser.email ?? session.user.email ?? "",
      n8nUser.password ?? "",
    );
    // Refetch through the user's own n8n identity immediately before execution.
    // This rechecks access and binds approval to the exact saved definition.
    const workflow = await client.getWorkflowDefinition(id);
    if (
      workflow.name !== approval.data.workflowName ||
      getN8nWorkflowRevision(workflow) !== approval.data.graphRevision
    ) {
      return Response.json(
        {
          error:
            "Workflow changed after review. Review it again before running.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const manualTrigger = workflow.nodes.find(
      (node) =>
        node.type === "n8n-nodes-base.manualTrigger" ||
        node.type === "n8n-nodes-base.start",
    );
    if (
      Object.keys(approval.data.payload).length > 0 &&
      (!manualTrigger || !manualTrigger.name)
    ) {
      return Response.json(
        {
          error:
            "This workflow has no manual start node for the reviewed input.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const consumed = await workflowRunApprovalRepository.consume(
      session.user.id,
      input.approvalToken,
      approval.data,
    );
    if (!consumed)
      return new Response(
        "Workflow approval is expired, mismatched, or already used",
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    const trigger =
      manualTrigger && Object.keys(approval.data.payload).length > 0
        ? {
            name: manualTrigger.name ?? "",
            data: { data: { main: [[{ json: approval.data.payload }]] } },
          }
        : undefined;
    const result = await client.runWorkflow(id, trigger);
    return Response.json(getN8nRunAcknowledgement(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof N8nError && error.status === 404)
      return new Response("Workflow not found", { status: 404 });
    if (error instanceof N8nError && error.status === 401)
      return new Response("Unauthorized", { status: 401 });
    return Response.json(
      { error: "Could not run workflow" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
