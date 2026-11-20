import "server-only";

import {
  SUBSCRIPTION_TIER_VALUES,
  type SubscriptionTierName,
} from "app-types/subscription";
import { siteConfigRepository } from "lib/db/repository";
import {
  type CyberDefaultAgentConfig,
  DEFAULT_CYBER_AUTO_AGENT,
  DEFAULT_CYBER_AUTO_PROMPT,
  DEFAULT_FINDING_SCRIBE_AGENT,
  DEFAULT_FINDING_SCRIBE_PROMPT,
} from "./default-agent-types";

export {
  type CyberDefaultAgentConfig,
  DEFAULT_CYBER_AUTO_AGENT,
  DEFAULT_CYBER_AUTO_PROMPT,
  DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
  DEFAULT_FINDING_SCRIBE_AGENT,
  DEFAULT_FINDING_SCRIBE_PROMPT,
} from "./default-agent-types";

export interface CyberBuiltinSkill {
  slug: string;
  name: string;
  repoUrl: string;
  description: string;
  enabled: boolean;
  mountPath: string;
}

export interface CyberPlanQuota {
  maxConcurrentAgents: number;
  maxActiveCyberSessions: number;
}

export interface CyberSystemConfig {
  planLimits: Record<SubscriptionTierName, CyberPlanQuota>;
  builtinSkills: CyberBuiltinSkill[];
  seededSkillSlugs?: string[];
  autoBootSandbox: boolean;
  defaultAgentPrompt: string;
  findingScribePrompt: string;
  defaultAutoAgent: CyberDefaultAgentConfig;
  findingScribeAgent: CyberDefaultAgentConfig;
}

export const DEFAULT_CYBER_SKILLS: CyberBuiltinSkill[] = [
  {
    slug: "cloudflare-security-audit",
    name: "Cloudflare Security Audit",
    repoUrl: "https://github.com/cloudflare/security-audit-skill.git",
    description:
      "Cloudflare's security audit skill — automatically cloned and hooked into the E2B sandbox on boot.",
    enabled: true,
    mountPath: "/home/user/skills/cloudflare-security-audit",
  },
  {
    slug: "claude-bughunter",
    name: "Claude BugHunter",
    repoUrl: "https://github.com/elementalsouls/Claude-BugHunter.git",
    description:
      "Authorized bug bounty skill bundle covering recon, web-app vulnerability classes, framework analysis, and disclosure reporting.",
    enabled: true,
    mountPath: "/home/user/skills/claude-bughunter",
  },
  {
    slug: "subdomainx",
    name: "SubdomainX",
    repoUrl: "https://github.com/elementalsouls/SubdomainX.git",
    description:
      "Subdomain enumeration and authorized attack-surface reconnaissance toolkit with passive OSINT and live host checks.",
    enabled: true,
    mountPath: "/home/user/skills/subdomainx",
  },
  {
    slug: "secskills",
    name: "SecSkills",
    repoUrl: "https://github.com/trilwu/secskills.git",
    description:
      "Comprehensive security engineering SKILL.md collection covering code auditing, cloud/web security, detection-as-code, and OWASP LLM security.",
    enabled: true,
    mountPath: "/home/user/skills/secskills",
  },
];

export const DEFAULT_CYBER_PLAN_LIMITS: Record<
  SubscriptionTierName,
  CyberPlanQuota
> = {
  free: {
    maxConcurrentAgents: 1,
    maxActiveCyberSessions: 1,
  },
  "voidagent-pro": {
    maxConcurrentAgents: 3,
    maxActiveCyberSessions: 3,
  },
  "voidagent-max": {
    maxConcurrentAgents: 5,
    maxActiveCyberSessions: 5,
  },
  "voidagent-enterprises": {
    maxConcurrentAgents: 10,
    maxActiveCyberSessions: 10,
  },
  "voidagent-enterprises-pro": {
    maxConcurrentAgents: 15,
    maxActiveCyberSessions: 20,
  },
  "voidagent-enterprises-max": {
    maxConcurrentAgents: 25,
    maxActiveCyberSessions: 50,
  },
};

export const CYBER_SITE_CONFIG_KEY = "cyber";

export function sanitizeSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isValidSkillRepoUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname || parsed.hostname === "localhost") return false;
    return true;
  } catch {
    return false;
  }
}

function mergeDefaultAgent(
  stored: unknown,
  fallback: CyberDefaultAgentConfig,
  legacyPrompt?: string,
): CyberDefaultAgentConfig {
  const rec =
    stored && typeof stored === "object"
      ? (stored as Partial<CyberDefaultAgentConfig>)
      : {};
  const resolvedPrompt =
    typeof rec.systemPrompt === "string" && rec.systemPrompt.trim().length > 0
      ? rec.systemPrompt.trim()
      : legacyPrompt && legacyPrompt.trim().length > 0
        ? legacyPrompt.trim()
        : fallback.systemPrompt;
  const resolvedMandatory =
    typeof rec.mandatorySystemPrompt === "string" &&
    rec.mandatorySystemPrompt.trim().length > 0
      ? rec.mandatorySystemPrompt.trim()
      : fallback.mandatorySystemPrompt;

  return {
    name:
      typeof rec.name === "string" && rec.name.trim().length > 0
        ? rec.name.trim().slice(0, 128)
        : fallback.name,
    description:
      typeof rec.description === "string"
        ? rec.description.trim().slice(0, 500)
        : fallback.description,
    icon:
      rec.icon && typeof rec.icon.value === "string"
        ? rec.icon
        : { ...fallback.icon },
    systemPrompt: resolvedPrompt,
    mandatorySystemPrompt: resolvedMandatory,
    mentions: Array.isArray(rec.mentions) ? rec.mentions : [],
    model: typeof rec.model === "string" && rec.model.trim() ? rec.model : null,
    knowledgeBases: Array.isArray(rec.knowledgeBases) ? rec.knowledgeBases : [],
  };
}

export function buildDefaultCyberConfig(): CyberSystemConfig {
  return {
    planLimits: { ...DEFAULT_CYBER_PLAN_LIMITS },
    builtinSkills: DEFAULT_CYBER_SKILLS.map((s) => ({ ...s })),
    seededSkillSlugs: DEFAULT_CYBER_SKILLS.map((s) => s.slug),
    autoBootSandbox: true,
    defaultAgentPrompt: DEFAULT_CYBER_AUTO_PROMPT,
    findingScribePrompt: DEFAULT_FINDING_SCRIBE_PROMPT,
    defaultAutoAgent: { ...DEFAULT_CYBER_AUTO_AGENT },
    findingScribeAgent: { ...DEFAULT_FINDING_SCRIBE_AGENT },
  };
}

export async function getCyberSystemConfig(): Promise<CyberSystemConfig> {
  const defaults = buildDefaultCyberConfig();
  try {
    const stored = await siteConfigRepository.getConfig(CYBER_SITE_CONFIG_KEY);
    if (!stored) return defaults;

    const storedPlanLimits = (stored.planLimits ?? {}) as Record<
      string,
      Partial<CyberPlanQuota>
    >;
    const mergedPlanLimits = { ...defaults.planLimits };
    for (const tier of SUBSCRIPTION_TIER_VALUES) {
      const override = storedPlanLimits[tier];
      if (override) {
        mergedPlanLimits[tier] = {
          maxConcurrentAgents:
            typeof override.maxConcurrentAgents === "number" &&
            override.maxConcurrentAgents >= 1
              ? Math.floor(override.maxConcurrentAgents)
              : defaults.planLimits[tier].maxConcurrentAgents,
          maxActiveCyberSessions:
            typeof override.maxActiveCyberSessions === "number" &&
            override.maxActiveCyberSessions >= 1
              ? Math.floor(override.maxActiveCyberSessions)
              : defaults.planLimits[tier].maxActiveCyberSessions,
        };
      }
    }

    const storedSkills = Array.isArray(stored.builtinSkills)
      ? (stored.builtinSkills as CyberBuiltinSkill[]).filter(
          (s) =>
            s &&
            typeof s.slug === "string" &&
            typeof s.repoUrl === "string" &&
            isValidSkillRepoUrl(s.repoUrl),
        )
      : defaults.builtinSkills;

    // Auto-install newly added default skills once on existing DBs without
    // resurrecting skills that an admin explicitly removed later.
    const previouslySeeded = new Set<string>(
      Array.isArray(stored.seededSkillSlugs)
        ? (stored.seededSkillSlugs as string[])
        : ["cloudflare-security-audit"],
    );
    const existingSlugs = new Set(storedSkills.map((s) => s.slug));
    const newlyAddedDefaults = DEFAULT_CYBER_SKILLS.filter(
      (s) => !previouslySeeded.has(s.slug) && !existingSlugs.has(s.slug),
    );
    const mergedSkills =
      storedSkills.length > 0
        ? [...storedSkills, ...newlyAddedDefaults.map((s) => ({ ...s }))]
        : defaults.builtinSkills;
    const allSeededSlugs = Array.from(
      new Set([
        ...previouslySeeded,
        ...DEFAULT_CYBER_SKILLS.map((s) => s.slug),
      ]),
    );

    const legacyDefaultPrompt =
      typeof stored.defaultAgentPrompt === "string" &&
      stored.defaultAgentPrompt.trim().length > 0
        ? stored.defaultAgentPrompt.trim()
        : undefined;
    const legacyScribePrompt =
      typeof stored.findingScribePrompt === "string" &&
      stored.findingScribePrompt.trim().length > 0
        ? stored.findingScribePrompt.trim()
        : undefined;

    const defaultAutoAgent = mergeDefaultAgent(
      stored.defaultAutoAgent,
      defaults.defaultAutoAgent,
      legacyDefaultPrompt,
    );
    const findingScribeAgent = mergeDefaultAgent(
      stored.findingScribeAgent,
      defaults.findingScribeAgent,
      legacyScribePrompt,
    );

    return {
      planLimits: mergedPlanLimits,
      builtinSkills: mergedSkills,
      seededSkillSlugs: allSeededSlugs,
      autoBootSandbox:
        typeof stored.autoBootSandbox === "boolean"
          ? stored.autoBootSandbox
          : defaults.autoBootSandbox,
      defaultAgentPrompt: defaultAutoAgent.systemPrompt,
      findingScribePrompt: findingScribeAgent.systemPrompt,
      defaultAutoAgent,
      findingScribeAgent,
    };
  } catch {
    return defaults;
  }
}

export async function saveCyberSystemConfig(
  next: CyberSystemConfig,
  changedByUserId: string,
): Promise<CyberSystemConfig> {
  await siteConfigRepository.upsert(
    CYBER_SITE_CONFIG_KEY,
    next as unknown as Record<string, unknown>,
    changedByUserId,
    "update",
  );
  return getCyberSystemConfig();
}
