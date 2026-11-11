import { withAuth } from "auth/route-guard";
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

const routeContextSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
});
const emptyBodySchema = z.object({}).strict();

export const POST = withAuth(
  async (request, session, { params }: { params: Promise<{ id: string }> }) => {
    if (!isSameOriginN8nRequest(request))
      return new Response("Forbidden", { status: 403 });
    const { id } = await params;
    if (!routeContextSchema.safeParse({ id }).success)
      return new Response("Invalid workflow ID", { status: 400 });
    const body = await readN8nJson(request, 1_000);
    if (!body.ok) return readN8nBodyError(body.reason);
    if (!emptyBodySchema.safeParse(body.value).success)
      return new Response("Invalid review request", { status: 400 });

    try {
      const rate = await checkApiRateLimit({
        kind: "n8n-workflow-review",
        id: session.user.id,
        limit: 30,
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
      const review = getN8nWorkflowEffectReview(workflow);
      const result = {
        workflowName: workflow.name,
        graphRevision: getN8nWorkflowRevision(workflow),
        ...review,
      };
      return Response.json(result, {
        status: review.reviewable ? 200 : 422,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const status =
        error instanceof N8nError && error.status === 404 ? 404 : 502;
      return Response.json(
        { error: "Could not inspect n8n workflow" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
);
