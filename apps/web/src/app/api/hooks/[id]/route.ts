import {
  listHookRuns,
  updateEndpointHookConfig,
} from "@/lib/db/pg/repositories/hook-repository.pg";
import { withAuth } from "auth/route-guard";
import { inboundRepository } from "lib/db/repository";
import { z } from "zod";

/**
 * Void Hooks per-endpoint API. All paths are owner-scoped: the endpoint row
 * must belong to the session user.
 *
 * GET    /api/hooks/[id]      — the hook + its recent runs
 * PATCH  /api/hooks/[id]      — update config / toggle enabled / rebind agent
 * DELETE /api/hooks/[id]      — remove the hook (endpoint cascade)
 */

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    agentId: z.string().uuid().optional(),
    promptTemplate: z.string().max(8_000).nullable().optional(),
    cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
    maxRunsPerDay: z.number().int().min(1).max(1_000).optional(),
    matchRules: z
      .array(
        z.object({
          field: z.enum(["source", "from", "subject", "text"]),
          op: z.enum(["contains", "equals"]),
          value: z.string().min(1).max(400),
        }),
      )
      .max(6)
      .nullable()
      .optional(),
  })
  .strip();

async function loadOwnedEndpoint(id: string, userId: string) {
  const endpoints = await inboundRepository.listInboundEndpoints(userId);
  return endpoints.find((endpoint) => endpoint.id === id) ?? null;
}

export const GET = withAuth(async (_request, session, ctx: Params) => {
  const { id } = await ctx.params;
  const endpoint = await loadOwnedEndpoint(id, session.user.id);
  if (!endpoint) {
    return Response.json({ error: "Hook not found" }, { status: 404 });
  }
  const runs = await listHookRuns(session.user.id, 100).then((all) =>
    all.filter((run) => run.inboundEndpointId === id),
  );
  return Response.json({
    hook: {
      id: endpoint.id,
      kind: endpoint.kind,
      agentId: endpoint.agentId,
      token: endpoint.token,
      enabled: endpoint.enabled,
      hookConfig: (endpoint as { hookConfig?: unknown }).hookConfig ?? {},
      createdAt: endpoint.createdAt,
    },
    runs,
  });
});

export const PATCH = withAuth(async (request, session, ctx: Params) => {
  const { id } = await ctx.params;
  const endpoint = await loadOwnedEndpoint(id, session.user.id);
  if (!endpoint) {
    return Response.json({ error: "Hook not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.message },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.enabled !== undefined || data.agentId !== undefined) {
    await inboundRepository.updateInboundEndpoint(id, session.user.id, {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.agentId !== undefined ? { agentId: data.agentId } : {}),
    });
  }
  if (
    data.promptTemplate !== undefined ||
    data.cooldownSeconds !== undefined ||
    data.maxRunsPerDay !== undefined ||
    data.matchRules !== undefined
  ) {
    const current =
      (endpoint as { hookConfig?: Record<string, unknown> }).hookConfig ?? {};
    await updateEndpointHookConfig(id, session.user.id, {
      promptTemplate:
        data.promptTemplate === undefined
          ? typeof current.promptTemplate === "string"
            ? current.promptTemplate
            : undefined
          : (data.promptTemplate ?? undefined),
      cooldownSeconds:
        data.cooldownSeconds ??
        (typeof current.cooldownSeconds === "number"
          ? current.cooldownSeconds
          : undefined),
      maxRunsPerDay:
        data.maxRunsPerDay ??
        (typeof current.maxRunsPerDay === "number"
          ? current.maxRunsPerDay
          : undefined),
      matchRules: data.matchRules ?? undefined,
    });
  }

  const updated = await loadOwnedEndpoint(id, session.user.id);
  return Response.json({
    hook: updated
      ? {
          id: updated.id,
          kind: updated.kind,
          agentId: updated.agentId,
          token: updated.token,
          enabled: updated.enabled,
          hookConfig: (updated as { hookConfig?: unknown }).hookConfig ?? {},
          createdAt: updated.createdAt,
        }
      : null,
  });
});

export const DELETE = withAuth(async (_request, session, ctx: Params) => {
  const { id } = await ctx.params;
  const endpoint = await loadOwnedEndpoint(id, session.user.id);
  if (!endpoint) {
    return Response.json({ error: "Hook not found" }, { status: 404 });
  }
  const removed = await inboundRepository.deleteInboundEndpoint(
    id,
    session.user.id,
  );
  return Response.json({ deleted: removed });
});
