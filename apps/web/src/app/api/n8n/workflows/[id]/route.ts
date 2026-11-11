import { withAuth } from "auth/route-guard";
import { N8nError, createUserClient } from "lib/n8n/client";
import {
  isSameOriginN8nRequest,
  readN8nBodyError,
  readN8nJson,
} from "lib/n8n/http";
import { ensureN8nUser } from "lib/n8n/provision";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
});
const deactivateSchema = z.object({ active: z.literal(false) }).strict();

type RouteContext = { params: Promise<{ id: string }> };

async function checkMutation(request: Request, userId: string, id: string) {
  if (!isSameOriginN8nRequest(request))
    return new Response("Forbidden", { status: 403 });
  if (!paramsSchema.safeParse({ id }).success)
    return new Response("Invalid workflow ID", { status: 400 });
  try {
    const rate = await checkApiRateLimit({
      kind: "n8n-workflow-edit",
      id: userId,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
  } catch {
    return new Response("Workflow service is unavailable", { status: 503 });
  }
  return null;
}

export const PATCH = withAuth(
  async (request, session, { params }: RouteContext) => {
    const { id } = await params;
    const rejected = await checkMutation(request, session.user.id, id);
    if (rejected) return rejected;
    const body = await readN8nJson(request, 2_000);
    if (!body.ok) return readN8nBodyError(body.reason);
    const parsed = deactivateSchema.safeParse(body.value);
    if (!parsed.success)
      return new Response("Only deactivation is supported", { status: 400 });

    try {
      const n8nUser = await ensureN8nUser(session);
      await createUserClient(
        n8nUser.email ?? session.user.email ?? "",
        n8nUser.password ?? "",
      ).updateWorkflow(id, parsed.data);
      return Response.json(
        { success: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const status =
        error instanceof N8nError && error.status === 404 ? 404 : 502;
      return Response.json(
        { error: "Could not update n8n workflow" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
);

export const DELETE = withAuth(
  async (request, session, { params }: RouteContext) => {
    const { id } = await params;
    const rejected = await checkMutation(request, session.user.id, id);
    if (rejected) return rejected;
    try {
      const n8nUser = await ensureN8nUser(session);
      await createUserClient(
        n8nUser.email ?? session.user.email ?? "",
        n8nUser.password ?? "",
      ).deleteWorkflow(id);
      return Response.json(
        { success: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const status =
        error instanceof N8nError && error.status === 404 ? 404 : 502;
      return Response.json(
        { error: "Could not delete n8n workflow" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
);
