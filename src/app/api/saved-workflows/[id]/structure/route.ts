import { getSession } from "auth/server";
import { canEditWorkflow } from "lib/auth/permissions";
import { workflowRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const jsonObject = z.record(z.string(), z.unknown());
const structureSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: uuid,
            workflowId: uuid.optional(),
            kind: z.string().min(1).max(64),
            name: z.string().min(1).max(120),
            description: z.string().max(2_000).optional().nullable(),
            nodeConfig: jsonObject,
            uiConfig: jsonObject,
          })
          .strict(),
      )
      .max(200)
      .optional()
      .default([]),
    edges: z
      .array(
        z
          .object({
            id: uuid,
            workflowId: uuid.optional(),
            source: uuid,
            target: uuid,
            uiConfig: jsonObject,
          })
          .strict(),
      )
      .max(500)
      .optional()
      .default([]),
    deleteNodes: z.array(uuid).max(200).optional().default([]),
    deleteEdges: z.array(uuid).max(500).optional().default([]),
  })
  .strict();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(
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
  if (!uuidPattern.test(id)) return new Response("Not found", { status: 404 });
  const workflow = await workflowRepository.selectById(id);
  if (!workflow || workflow.userId !== session.user.id)
    return new Response("Not found", { status: 404 });
  if (workflow.isPublished)
    return new Response("Published workflows cannot be edited", {
      status: 409,
    });
  const rate = await checkApiRateLimit({
    kind: "saved-workflow-structure",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJsonRequest(request, 1_048_576);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = structureSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid workflow structure" },
      { status: 400 },
    );
  const now = new Date();
  await workflowRepository.saveStructure({
    workflowId: id,
    nodes: parsed.data.nodes.map((node) => ({
      ...node,
      description: node.description ?? undefined,
      workflowId: id,
      createdAt: now,
      updatedAt: now,
    })),
    edges: parsed.data.edges.map((edge) => ({
      ...edge,
      workflowId: id,
      createdAt: now,
    })),
    deleteNodes: parsed.data.deleteNodes,
    deleteEdges: parsed.data.deleteEdges,
  });
  return Response.json({ success: true });
}
