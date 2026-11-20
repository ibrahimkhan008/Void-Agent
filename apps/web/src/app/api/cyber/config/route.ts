import {
  SUBSCRIPTION_TIER_VALUES,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { requireCyberAccess } from "lib/cyber/auth";
import {
  type CyberBuiltinSkill,
  type CyberDefaultAgentConfig,
  type CyberSystemConfig,
  DEFAULT_CYBER_AUTO_AGENT,
  DEFAULT_CYBER_AUTO_PROMPT,
  DEFAULT_FINDING_SCRIBE_AGENT,
  DEFAULT_FINDING_SCRIBE_PROMPT,
  getCyberSystemConfig,
  isValidSkillRepoUrl,
  sanitizeSkillSlug,
  saveCyberSystemConfig,
} from "lib/cyber/config";
import { resolveUserCyberQuotas } from "lib/cyber/quotas";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET() {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const [config, quotas] = await Promise.all([
    getCyberSystemConfig(),
    resolveUserCyberQuotas(access.session.user.id, access.profile),
  ]);

  return NextResponse.json({
    config,
    quotas,
    defaultPrompts: {
      defaultAgentPrompt: DEFAULT_CYBER_AUTO_PROMPT,
      findingScribePrompt: DEFAULT_FINDING_SCRIBE_PROMPT,
    },
    factoryDefaultAgents: {
      defaultAutoAgent: DEFAULT_CYBER_AUTO_AGENT,
      findingScribeAgent: DEFAULT_FINDING_SCRIBE_AGENT,
    },
    plans: SUBSCRIPTION_TIER_VALUES.map((tier) => ({
      id: tier,
      label: subscriptionTiersInfo[tier].label,
      description: subscriptionTiersInfo[tier].description,
    })),
    e2bConfigured: Boolean(process.env.E2B_API_KEY),
  });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  let body: Partial<CyberSystemConfig>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await getCyberSystemConfig();

  // Merge plan limits
  const nextPlanLimits = { ...current.planLimits };
  if (body.planLimits && typeof body.planLimits === "object") {
    for (const tier of SUBSCRIPTION_TIER_VALUES) {
      const incoming = body.planLimits[tier];
      if (!incoming) continue;
      const agents = Number(incoming.maxConcurrentAgents);
      const sessions = Number(incoming.maxActiveCyberSessions);
      nextPlanLimits[tier] = {
        maxConcurrentAgents:
          Number.isFinite(agents) && agents >= 1 && agents <= 500
            ? Math.floor(agents)
            : nextPlanLimits[tier].maxConcurrentAgents,
        maxActiveCyberSessions:
          Number.isFinite(sessions) && sessions >= 1 && sessions <= 500
            ? Math.floor(sessions)
            : nextPlanLimits[tier].maxActiveCyberSessions,
      };
    }
  }

  // Validate built-in skills if provided
  let nextSkills: CyberBuiltinSkill[] = current.builtinSkills;
  if (Array.isArray(body.builtinSkills)) {
    const cleaned: CyberBuiltinSkill[] = [];
    const seen = new Set<string>();
    for (const raw of body.builtinSkills) {
      if (!raw || typeof raw.repoUrl !== "string") continue;
      const repoUrl = raw.repoUrl.trim();
      if (!isValidSkillRepoUrl(repoUrl)) {
        return NextResponse.json(
          {
            error: `Invalid skill git repository URL: '${repoUrl}'. Must be a valid HTTPS URL.`,
          },
          { status: 400 },
        );
      }
      const slug = sanitizeSkillSlug(
        raw.slug ||
          raw.name ||
          repoUrl
            .split("/")
            .pop()
            ?.replace(/\.git$/i, "") ||
          "skill",
      );
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      cleaned.push({
        slug,
        name: (raw.name || slug).trim().slice(0, 120),
        repoUrl,
        description: (raw.description || "").trim().slice(0, 500),
        enabled: raw.enabled !== false,
        mountPath: `/home/user/skills/${slug}`,
      });
    }
    nextSkills = cleaned;
  }

  function sanitizeIncomingAgent(
    incoming: Partial<CyberDefaultAgentConfig> | undefined,
    fallback: CyberDefaultAgentConfig,
  ):
    | { ok: true; value: CyberDefaultAgentConfig }
    | { ok: false; error: string } {
    if (!incoming) return { ok: true, value: fallback };
    const name = (incoming.name ?? fallback.name).trim().slice(0, 128);
    const systemPrompt = (incoming.systemPrompt ?? "").trim();
    const mandatorySystemPrompt = (incoming.mandatorySystemPrompt ?? "").trim();

    if (!name) {
      return { ok: false, error: "Agent name is required." };
    }
    if (!systemPrompt) {
      return {
        ok: false,
        error: `System prompt is required for "${name}".`,
      };
    }
    if (!mandatorySystemPrompt) {
      return {
        ok: false,
        error: `Extra mandatory system prompt is required for "${name}".`,
      };
    }

    return {
      ok: true,
      value: {
        name,
        description: (incoming.description ?? fallback.description)
          .trim()
          .slice(0, 500),
        icon:
          incoming.icon && typeof incoming.icon.value === "string"
            ? incoming.icon
            : fallback.icon,
        systemPrompt: systemPrompt.slice(0, 8000),
        mandatorySystemPrompt: mandatorySystemPrompt.slice(0, 8000),
        mentions: Array.isArray(incoming.mentions)
          ? incoming.mentions
          : fallback.mentions,
        model:
          typeof incoming.model === "string" && incoming.model.trim()
            ? incoming.model.trim()
            : incoming.model === null
              ? null
              : fallback.model,
        knowledgeBases: Array.isArray(incoming.knowledgeBases)
          ? incoming.knowledgeBases
          : fallback.knowledgeBases,
      },
    };
  }

  const nextAutoAgentRes = sanitizeIncomingAgent(
    body.defaultAutoAgent,
    current.defaultAutoAgent,
  );
  if (!nextAutoAgentRes.ok) {
    return NextResponse.json(
      { error: nextAutoAgentRes.error },
      { status: 400 },
    );
  }
  const nextScribeAgentRes = sanitizeIncomingAgent(
    body.findingScribeAgent,
    current.findingScribeAgent,
  );
  if (!nextScribeAgentRes.ok) {
    return NextResponse.json(
      { error: nextScribeAgentRes.error },
      { status: 400 },
    );
  }

  // Also respect legacy prompt-only updates if sent
  const finalAutoAgent: CyberDefaultAgentConfig = {
    ...nextAutoAgentRes.value,
    ...(typeof body.defaultAgentPrompt === "string" &&
    body.defaultAgentPrompt.trim() &&
    !body.defaultAutoAgent
      ? { systemPrompt: body.defaultAgentPrompt.trim().slice(0, 8000) }
      : {}),
  };
  const finalScribeAgent: CyberDefaultAgentConfig = {
    ...nextScribeAgentRes.value,
    ...(typeof body.findingScribePrompt === "string" &&
    body.findingScribePrompt.trim() &&
    !body.findingScribeAgent
      ? { systemPrompt: body.findingScribePrompt.trim().slice(0, 8000) }
      : {}),
  };

  const saved = await saveCyberSystemConfig(
    {
      planLimits: nextPlanLimits,
      builtinSkills: nextSkills,
      seededSkillSlugs: current.seededSkillSlugs,
      autoBootSandbox:
        typeof body.autoBootSandbox === "boolean"
          ? body.autoBootSandbox
          : current.autoBootSandbox,
      defaultAgentPrompt: finalAutoAgent.systemPrompt,
      findingScribePrompt: finalScribeAgent.systemPrompt,
      defaultAutoAgent: finalAutoAgent,
      findingScribeAgent: finalScribeAgent,
    },
    access.session.user.id,
  );

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "cyber_config_updated",
      severity: "info",
      details: {
        skillCount: saved.builtinSkills.length,
        autoBootSandbox: saved.autoBootSandbox,
      },
    })
    .catch(() => {});

  return NextResponse.json({ config: saved });
}
