import { withAuth } from "auth/route-guard";
import { workflowRunApprovalSchema } from "lib/ai/tools/hitl/workflow-run-approval";
import { workflowRunApprovalRepository } from "lib/db/pg/repositories/workflow-run-approval-repository.pg";
import { N8nError, createUserClient } from "lib/n8n/client";
import {
  isSameOriginN8nRequest,
  readN8nBodyError,
  readN8nJson,
} from "lib/n8n/http";
import { ensureN8nUser } from "lib/n8n/provision";
import {
  getN8nWorkflowEffectReview,
  getN8nWorkflowRevision,
} from "lib/n8n/workflow-review";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
});
const bodySchema = z
  .object({
    workflowName: z.string().trim().min(1).max(160),
    graphRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    payload: z.record(z.string().max(160), z.unknown()),
  })
  .strict();

export const POST = withAuth(
  async (request, session, { params }: { params: Promise<{ id: string }> }) => {
    if (!isSameOriginN8nRequest(request))
      return new Response("Forbidden", { status: 403 });
    const { id } = await params;
    if (!paramsSchema.safeParse({ id }).success)
      return new Response("Invalid workflow ID", { status: 400 });
    const body = await readN8nJson(request, 20_000);
    if (!body.ok) return readN8nBodyError(body.reason);
    const parsedBody = bodySchema.safeParse(body.value);
    if (!parsedBody.success)
      return new Response("Invalid workflow approval", { status: 400 });

    const approval = workflowRunApprovalSchema.safeParse({
      platform: "n8n",
      target: id,
      ...parsedBody.data,
    });
    if (!approval.success)
      return new Response("Invalid workflow approval", { status: 400 });

    try {
      const rate = await checkApiRateLimit({
        kind: "n8n-workflow-approval",
        id: session.user.id,
        limit: 20,
        windowMs: 60_000,
      });
      if (!rate.allowed)
        return new Response("Too many requests", { status: 429 });
    } catch {
      return new Response("Workflow service is unavailable", { status: 503 });
    }

    try {
      const n8nUser = await ensureN8nUser(session);
      const workflow = await createUserClient(
        n8nUser.email ?? session.user.email ?? "",
        n8nUser.password ?? "",
      ).getWorkflowDefinition(id);
      if (
        workflow.name !== approval.data.workflowName ||
        getN8nWorkflowRevision(workflow) !== approval.data.graphRevision
      ) {
        return Response.json(
          {
            error:
              "Workflow changed while it was being reviewed. Review it again before running.",
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      const review = getN8nWorkflowEffectReview(workflow);
      if (!review.reviewable)
        return Response.json(
          {
            error:
              "Workflow contains actions that cannot be reviewed safely and cannot be approved.",
          },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );

      const approvalToken = await workflowRunApprovalRepository.issue(
        session.user.id,
        approval.data,
      );
      return Response.json(
        { approvalToken },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const status =
        error instanceof N8nError && error.status === 404 ? 404 : 502;
      return Response.json(
        { error: "Could not record n8n workflow approval" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
);
