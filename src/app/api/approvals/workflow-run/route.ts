import { getSession } from "auth/server";
import { workflowRunApprovalSchema } from "lib/ai/tools/hitl/workflow-run-approval";
import { assertWorkflowMcpAccess } from "lib/ai/workflow/assert-workflow-mcp-access";
import {
  getWorkflowEffectManifest,
  getWorkflowGraphRevision,
} from "lib/ai/workflow/workflow-review";
import { workflowRunApprovalRepository } from "lib/db/pg/repositories/workflow-run-approval-repository.pg";
import { workflowRepository } from "lib/db/repository";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import {
  getN8nWorkflowEffectManifest,
  getN8nWorkflowRevision,
} from "lib/n8n/workflow-review";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    kind: "workflow-run-approval",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 20_000);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const preview = body.value as {
    previewWorkflowId?: unknown;
    workflowName?: unknown;
  };
  if (
    typeof preview.previewWorkflowId === "string" &&
    typeof preview.workflowName === "string"
  ) {
    try {
      const workflows = await workflowRepository.selectExecuteAbility(
        session.user.id,
      );
      if (
        !workflows.some(
          (workflow) =>
            workflow.id === preview.previewWorkflowId &&
            workflow.name === preview.workflowName,
        )
      )
        return new Response("Workflow not found", { status: 404 });
      const workflow = await workflowRepository.selectStructureById(
        preview.previewWorkflowId,
        { ignoreNote: true },
      );
      if (
        !workflow ||
        workflow.name !== preview.workflowName ||
        !workflow.isPublished
      )
        return new Response("Workflow not found", { status: 404 });
      await assertWorkflowMcpAccess(session.user.id, workflow.nodes);
      return Response.json(
        {
          graphRevision: getWorkflowGraphRevision(
            workflow.nodes,
            workflow.edges,
          ),
          effects: getWorkflowEffectManifest(workflow.nodes),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return Response.json(
        { error: "Could not inspect workflow" },
        { status: 503 },
      );
    }
  }
  const n8nPreview = body.value as { previewN8nWorkflowId?: unknown };
  if (typeof n8nPreview.previewN8nWorkflowId === "string") {
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(n8nPreview.previewN8nWorkflowId))
      return new Response("Invalid workflow ID", { status: 400 });
    try {
      const n8nUser = await ensureN8nUser(session);
      const client = createUserClient(
        n8nUser.email ?? session.user.email ?? "",
        n8nUser.password ?? "",
      );
      const workflow = await client.getWorkflowDefinition(
        n8nPreview.previewN8nWorkflowId,
      );
      return Response.json(
        {
          workflowName: workflow.name,
          graphRevision: getN8nWorkflowRevision(workflow),
          effects: getN8nWorkflowEffectManifest(workflow),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return Response.json(
        { error: "Could not inspect workflow" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const parsed = workflowRunApprovalSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid workflow approval" },
      { status: 400 },
    );
  try {
    if (parsed.data.platform === "saved-workflow") {
      const workflows = await workflowRepository.selectExecuteAbility(
        session.user.id,
      );
      if (
        !workflows.some(
          (workflow) =>
            workflow.id === parsed.data.target &&
            workflow.name === parsed.data.workflowName,
        )
      ) {
        return new Response("Workflow not found", { status: 404 });
      }
      const workflow = await workflowRepository.selectStructureById(
        parsed.data.target,
        { ignoreNote: true },
      );
      if (
        !workflow ||
        !workflow.isPublished ||
        workflow.name !== parsed.data.workflowName ||
        getWorkflowGraphRevision(workflow.nodes, workflow.edges) !==
          parsed.data.graphRevision
      ) {
        return Response.json(
          {
            error:
              "Workflow changed while it was being reviewed. Review it again before running.",
          },
          { status: 409 },
        );
      }
      await assertWorkflowMcpAccess(session.user.id, workflow.nodes);
    }
    if (parsed.data.platform === "n8n") {
      const n8nUser = await ensureN8nUser(session);
      const client = createUserClient(
        n8nUser.email ?? session.user.email ?? "",
        n8nUser.password ?? "",
      );
      const workflow = await client.getWorkflowDefinition(parsed.data.target);
      if (
        workflow.name !== parsed.data.workflowName ||
        getN8nWorkflowRevision(workflow) !== parsed.data.graphRevision
      ) {
        return Response.json(
          {
            error:
              "Workflow changed while it was being reviewed. Review it again before running.",
          },
          { status: 409 },
        );
      }
    }
    const approvalToken = await workflowRunApprovalRepository.issue(
      session.user.id,
      parsed.data,
    );
    return Response.json(
      { approvalToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not record workflow approval" },
      { status: 503 },
    );
  }
}
