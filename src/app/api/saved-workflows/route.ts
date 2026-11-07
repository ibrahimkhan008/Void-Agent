import { getSession } from "auth/server";
import { canCreateWorkflow } from "lib/auth/permissions";
import { workflowRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional().default(""),
  })
  .strict();

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const workflows = (
    await workflowRepository.selectByUserId(session.user.id)
  ).filter(
    (workflow) => !workflow.isPublished && workflow.visibility === "private",
  );
  return Response.json(
    workflows.map(({ id, name, description, icon, updatedAt }) => ({
      id,
      name,
      description,
      icon,
      updatedAt,
    })),
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  if (!(await canCreateWorkflow()))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "saved-workflow-create",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJsonRequest(request, 8_192);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json({ error: "Invalid saved workflow" }, { status: 400 });

  const workflow = await workflowRepository.save({
    name: parsed.data.name,
    description: parsed.data.description,
    userId: session.user.id,
    isPublished: false,
    visibility: "private",
  });
  return Response.json(workflow, {
    status: 201,
    headers: { "Cache-Control": "private, no-store" },
  });
}
