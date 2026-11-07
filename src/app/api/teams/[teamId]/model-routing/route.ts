import { getSession } from "auth/server";
import { customModelProvider, ensureDynamicProvidersHydrated } from "lib/ai/models";
import { isChatModelProviderEnabled } from "lib/ai/model-provider-availability";
import type { RoutableModel } from "lib/ai/team-model-routing";
import { teamModelRoutingRepository, teamRepository } from "lib/db/repository";
import type { TeamModelRouteProfile, TeamModelRouteTask } from "lib/db/pg/schema.pg";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const taskKeys = [
  "general_chat",
  "coding",
  "web_development",
  "web_search",
  "document_extraction",
  "tool_calling",
  "writing",
  "reasoning",
  "vision",
] as const satisfies readonly TeamModelRouteTask[];

const profileSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(160),
  priority: z.number().int().min(0).max(1000),
  taskScores: z.partialRecord(
    z.enum(taskKeys),
    z.number().int().min(-100).max(100),
  ),
});

const policySchema = z.object({
  enabled: z.boolean(),
  profiles: z.array(profileSchema).max(40),
}).superRefine((policy, ctx) => {
  if (policy.enabled && policy.profiles.length === 0) {
    ctx.addIssue({ code: "custom", message: "Enabled routing requires at least one model." });
  }
  const seen = new Set<string>();
  for (const [index, profile] of policy.profiles.entries()) {
    const key = `${profile.provider.toLowerCase()}\u0000${profile.model}`;
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", path: ["profiles", index], message: "Models must be unique." });
    }
    seen.add(key);
  }
});

async function getTeamAccess(teamId: string, userId: string) {
  const [team, member] = await Promise.all([
    teamRepository.getTeam(teamId),
    teamRepository.getTeamMember(teamId, userId),
  ]);
  if (!team || !member) return null;
  return { team, member, canManage: team.ownerId === userId || member.role === "admin" || member.role === "owner" };
}

async function enabledModelCatalog() {
  await ensureDynamicProvidersHydrated();
  const catalog: RoutableModel[] = [];
  for (const provider of customModelProvider.modelsInfo) {
    if (!provider.hasAPIKey || !(await isChatModelProviderEnabled({ provider: provider.provider, model: "" }))) continue;
    for (const model of provider.models) {
      catalog.push({
        provider: provider.provider,
        model: model.name,
        toolCalling: !model.isToolCallUnsupported,
        vision: !model.isImageInputUnsupported,
      });
    }
  }
  return catalog;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { teamId } = await params;
  const access = await getTeamAccess(teamId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const [policy, models] = await Promise.all([
    teamModelRoutingRepository.getPolicy(teamId),
    enabledModelCatalog(),
  ]);
  return Response.json({
    policy,
    canManage: access.canManage,
    models: models.map(({ provider, model, toolCalling, vision }) => ({ provider, model, toolCalling, vision })),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { teamId } = await params;
  const access = await getTeamAccess(teamId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!access.canManage) return new Response("Forbidden", { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid routing policy.", issues: parsed.error.issues }, { status: 400 });
  }

  const catalog = await enabledModelCatalog();
  const allowed = new Set(catalog.map((model) => `${model.provider.toLowerCase()}\u0000${model.model}`));
  const disallowed = parsed.data.profiles.filter((profile) => !allowed.has(`${profile.provider.toLowerCase()}\u0000${profile.model}`));
  if (disallowed.length) {
    return Response.json({ error: "Routing policy contains models that are disabled or unavailable." }, { status: 400 });
  }

  const policy = await teamModelRoutingRepository.savePolicy({
    teamId,
    enabled: parsed.data.enabled,
    profiles: parsed.data.profiles as TeamModelRouteProfile[],
    updatedByUserId: session.user.id,
  });
  return Response.json({ policy });
}
