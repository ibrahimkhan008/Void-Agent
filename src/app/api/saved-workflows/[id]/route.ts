import { getSession } from "auth/server";
import { canDeleteWorkflow, canEditWorkflow } from "lib/auth/permissions";
import { workflowRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

async function ownedWorkflow(id: string, userId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  )
    return null;
  const workflow = await workflowRepository.selectById(id);
  return workflow?.userId === userId ? workflow : null;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const workflow = await ownedWorkflow(id, session.user.id);
  if (!workflow) return new Response("Not found", { status: 404 });
  const detail = await workflowRepository.selectStructureById(id);
  if (!detail) return new Response("Not found", { status: 404 });
  return Response.json(detail, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  if (!(await canEditWorkflow()))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const workflow = await ownedWorkflow(id, session.user.id);
  if (!workflow) return new Response("Not found", { status: 404 });
  if (workflow.isPublished)
    return new Response("Published workflows are immutable here", {
      status: 409,
    });
  const rate = await checkApiRateLimit({
    kind: "saved-workflow-update",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJsonRequest(request, 8_192);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = updateSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid saved workflow update" },
      { status: 400 },
    );
  const updated = await workflowRepository.save({
    id,
    userId: session.user.id,
    name: parsed.data.name ?? workflow.name,
    description: parsed.data.description ?? workflow.description ?? "",
  });
  return Response.json(updated, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  if (!(await canDeleteWorkflow()))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const workflow = await ownedWorkflow(id, session.user.id);
  if (!workflow) return new Response("Not found", { status: 404 });
  if (workflow.isPublished)
    return new Response("Published workflows cannot be deleted here", {
      status: 409,
    });
  await workflowRepository.delete(id);
  return new Response(null, { status: 204 });
}
