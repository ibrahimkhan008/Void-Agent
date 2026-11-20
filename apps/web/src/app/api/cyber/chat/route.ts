import { parseAgentModel } from "@/lib/ai/agent-model";
import { generateText } from "ai";
import { getModelInstance } from "lib/ai/models";
import { requireCyberAccess } from "lib/cyber/auth";
import { getCyberSystemConfig } from "lib/cyber/config";
import {
  acquireCyberAgentSlot,
  releaseCyberAgentSlot,
  resolveUserCyberQuotas,
} from "lib/cyber/quotas";
import {
  type HookedSkillResult,
  bootCyberSandboxWithSkills,
} from "lib/cyber/sandbox-boot";
import {
  type ProgramScopeAsset,
  evaluateTargetScope,
} from "lib/cyber/scope-matcher";
import {
  FINDING_SCRIBE_AGENT_ID,
  SELF_LEARNING_E2B_MOUNT_PATH,
  getOrInitializeCyberLearningFile,
  runPostTurnCyberAutomation,
} from "lib/cyber/self-learning";
import {
  type CyberAgent,
  type CyberProgram,
  cyberRepository,
} from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Server-side cache of auto-booted E2B sandboxes per sandboxId so the first
 * message in a Void Cyber chat boots E2B + hooks skills automatically and
 * subsequent messages reuse the warm sandbox transparently (never exposed to users).
 */
interface CachedCyberSandbox {
  sandboxId: string;
  userId: string;
  hookedSkills: HookedSkillResult[];
  bootedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _cyberSandboxCache: Map<string, CachedCyberSandbox> | undefined;
}

const SANDBOX_CACHE_TTL_MS = 12 * 60 * 1000;
const cyberSandboxCache =
  globalThis._cyberSandboxCache ?? new Map<string, CachedCyberSandbox>();
globalThis._cyberSandboxCache = cyberSandboxCache;

function extractTargetCandidates(text: string): string[] {
  const candidates = new Set<string>();

  const urlMatches = text.match(/https?:\/\/[^\s"'<>()]+/gi) ?? [];
  for (const u of urlMatches) {
    candidates.add(u.replace(/[.,;:!?)]+$/, ""));
  }

  const ipv4Matches =
    text.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) ?? [];
  for (const ip of ipv4Matches) {
    candidates.add(ip);
  }

  const domainMatches =
    text.match(
      /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|dev|app|ai|space|co|gov|edu|cloud|internal|local|corp|xyz|tech|security)\b/gi,
    ) ?? [];
  for (const d of domainMatches) {
    const alreadyInUrl = Array.from(candidates).some((c) =>
      c.toLowerCase().includes(d.toLowerCase()),
    );
    if (!alreadyInUrl) {
      candidates.add(d.toLowerCase());
    }
  }

  return Array.from(candidates);
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    message?: string;
    customAgentId?: string | null;
    programId?: string | null;
    sandboxId?: string | null;
    autoLearnAndLog?: boolean;
    hookedSkills?: Array<{
      slug: string;
      name: string;
      repoUrl: string;
      mountPath: string;
      skillDoc?: string;
    }>;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Enforce owner-controlled Max Concurrent Agents per plan / user override
  const [quotas, cyberConfig, learningFile] = await Promise.all([
    resolveUserCyberQuotas(access.session.user.id, access.profile),
    getCyberSystemConfig(),
    getOrInitializeCyberLearningFile(access.session.user.id),
  ]);

  const slot = acquireCyberAgentSlot(
    access.session.user.id,
    quotas.maxConcurrentAgents,
  );
  if (!slot.acquired) {
    return NextResponse.json(
      {
        error: `Concurrent Cyber Agent limit reached (${slot.running}/${quotas.maxConcurrentAgents} running for ${quotas.planLabel} plan). Wait for an active agent run to finish or ask an admin to raise your concurrency limit.`,
        code: "CYBER_CONCURRENT_AGENT_LIMIT",
        quotas,
      },
      { status: 429 },
    );
  }

  try {
    // Load optional user-created Predefined Cyber Agent or built-in Finding Scribe
    const isFindingScribe = body.customAgentId === FINDING_SCRIBE_AGENT_ID;
    let customAgent: CyberAgent | null = null;
    if (body.customAgentId && !isFindingScribe) {
      const found = await cyberRepository.getAgentById(body.customAgentId);
      if (
        found &&
        (found.userId === access.session.user.id ||
          found.isShared ||
          access.profile.accessTier >= 3)
      ) {
        customAgent = found;
      }
    }

    const activeDefaultAgent = isFindingScribe
      ? cyberConfig.findingScribeAgent
      : cyberConfig.defaultAutoAgent;

    const activeAgentLabel = isFindingScribe
      ? activeDefaultAgent.name
      : (customAgent?.name ?? activeDefaultAgent.name);

    // Load optional Target Program (never mandatory — user can also specify target directly in chat)
    let program: CyberProgram | null = null;
    let scopes: ProgramScopeAsset[] = [];
    let scopeChecks: Array<{
      target: string;
      status: string;
      isInScope: boolean;
      reason: string;
    }> = [];

    if (body.programId) {
      program = await cyberRepository.getProgramById(body.programId);
      if (!program) {
        return NextResponse.json(
          { error: "Selected target program not found" },
          { status: 404 },
        );
      }

      const rawScopes = await cyberRepository.listProgramScopes(program.id);
      scopes = rawScopes.map((s) => ({
        id: s.id,
        assetIdentifier: s.assetIdentifier,
        assetType: s.assetType as ProgramScopeAsset["assetType"],
        isInScope: s.isInScope ?? true,
        maxSeverityAllowed: s.maxSeverityAllowed,
        instructionNotes: s.instructionNotes,
      }));

      const rulesMeta = (program.rulesMetadata ?? {}) as Record<
        string,
        unknown
      >;
      const excludedCategories = Array.isArray(rulesMeta.excludedCategories)
        ? rulesMeta.excludedCategories.filter(
            (x): x is string => typeof x === "string",
          )
        : [];

      const targets = extractTargetCandidates(message);
      const evaluations = targets.map((target) => ({
        target,
        ...evaluateTargetScope({ target, scopes, excludedCategories }),
      }));

      scopeChecks = evaluations.map((e) => ({
        target: e.target,
        status: e.status,
        isInScope: e.isInScope,
        reason: e.reason,
      }));

      const blocked = evaluations.filter((e) => !e.isInScope);
      if (blocked.length > 0) {
        cyberRepository
          .logAuditEvent({
            userId: access.session.user.id,
            eventType: "scope_breach_prevented",
            severity: "breach",
            details: {
              surface: "cyber_chat",
              programId: program.id,
              customAgentId: customAgent?.id ?? null,
              message: message.slice(0, 500),
              blockedTargets: blocked.map((b) => ({
                target: b.target,
                reason: b.reason,
              })),
            },
          })
          .catch(() => {});

        const blockResponse = [
          "**Pre-Flight Scope Gate Blocked Request**",
          "",
          `One or more targets referenced in your prompt are **out of scope** for **${program.name}**:`,
          "",
          ...blocked.map((b) => `- \`${b.target}\`: ${b.reason}`),
          "",
          "This attempt has been recorded in the immutable audit trail. Please restrict commands to registered in-scope assets or clear the target program binding.",
        ].join("\n");

        return NextResponse.json({
          response: blockResponse,
          blocked: true,
          agentLabel: customAgent?.name ?? "Void Cyber Agent",
          programName: program.name,
          scopeChecks,
        });
      }
    }

    // Active built-in skills (filtered by custom agent's skillSlugs if specified)
    const activeSkills = cyberConfig.builtinSkills.filter((s) => {
      if (!s.enabled) return false;
      if (
        customAgent &&
        Array.isArray(customAgent.skillSlugs) &&
        customAgent.skillSlugs.length > 0
      ) {
        return (customAgent.skillSlugs as string[]).includes(s.slug);
      }
      return true;
    });

    // Silent automatic E2B sandbox boot on the first message of a conversation
    // (no manual boot button needed; never leaks E2B internals to the user UI)
    const shouldUseSandbox =
      cyberConfig.autoBootSandbox &&
      (customAgent ? customAgent.sandboxEnabled : true);
    let activeSandboxId: string | null = body.sandboxId ?? null;
    let resolvedHookedSkills: HookedSkillResult[] = [];

    if (activeSandboxId) {
      const cached = cyberSandboxCache.get(activeSandboxId);
      if (
        cached &&
        cached.userId === access.session.user.id &&
        Date.now() - cached.bootedAt < SANDBOX_CACHE_TTL_MS
      ) {
        resolvedHookedSkills = cached.hookedSkills;
      } else {
        activeSandboxId = null;
      }
    }

    if (shouldUseSandbox && !activeSandboxId && process.env.E2B_API_KEY) {
      const bootRes = await bootCyberSandboxWithSkills({
        userId: access.session.user.id,
        skills: activeSkills,
        selfLearningMarkdown: learningFile.contentMarkdown,
        requestId: `cyber-auto-${Date.now()}`,
      });
      if (bootRes.status === "ready" && bootRes.sandboxId) {
        activeSandboxId = bootRes.sandboxId;
        resolvedHookedSkills = bootRes.hookedSkills;
        cyberSandboxCache.set(bootRes.sandboxId, {
          sandboxId: bootRes.sandboxId,
          userId: access.session.user.id,
          hookedSkills: bootRes.hookedSkills,
          bootedAt: Date.now(),
        });
        cyberRepository
          .logAuditEvent({
            userId: access.session.user.id,
            eventType: "cyber_sandbox_auto_booted",
            severity: "info",
            details: {
              sandboxId: bootRes.sandboxId,
              skills: bootRes.hookedSkills.map((s) => ({
                slug: s.slug,
                status: s.status,
              })),
            },
          })
          .catch(() => {});
      }
    }

    const hookedSkillDocs = resolvedHookedSkills
      .filter((s) => s.status === "hooked" && s.skillDoc)
      .map(
        (s) =>
          `### Skill: ${s.name} (${s.repoUrl})\nMount Path: ${s.mountPath}\n${s.skillDoc?.slice(0, 1500)}`,
      )
      .join("\n\n");

    const skillsSummary = activeSkills
      .map(
        (s) =>
          `- **${s.name}** (\`${s.repoUrl}\` → \`${s.mountPath}\`): ${s.description}`,
      )
      .join("\n");

    cyberRepository
      .logAuditEvent({
        userId: access.session.user.id,
        eventType: "cyber_chat_dispatched",
        severity: "info",
        details: {
          programId: program?.id ?? null,
          customAgentId: customAgent?.id ?? null,
          customAgentName: customAgent?.name ?? null,
          sandboxId: activeSandboxId,
          activeSkills: activeSkills.map((s) => s.slug),
          verifiedTargets: scopeChecks.map((s) => s.target),
          messagePreview: message.slice(0, 300),
        },
      })
      .catch(() => {});

    const inScopeList = scopes
      .filter((s) => s.isInScope)
      .map(
        (s) =>
          `- ${s.assetIdentifier} (${s.assetType})${s.instructionNotes ? ` — ${s.instructionNotes}` : ""}`,
      )
      .join("\n");

    const outOfScopeList = scopes
      .filter((s) => !s.isInScope)
      .map((s) => `- ${s.assetIdentifier} (${s.assetType})`)
      .join("\n");

    const selfLearningExcerpt =
      learningFile.entriesCount > 0
        ? `SELF-LEARNING BUG BOUNTY PLAYBOOK (${learningFile.filename}, mounted in E2B at ${SELF_LEARNING_E2B_MOUNT_PATH} — apply these previously learned tactics and avoid known false positives):\n${learningFile.contentMarkdown.slice(-4000)}`
        : "";

    const mandatoryContract = isFindingScribe
      ? cyberConfig.findingScribeAgent.mandatorySystemPrompt
      : cyberConfig.defaultAutoAgent.mandatorySystemPrompt;

    const systemPrompt = [
      mandatoryContract,
      "",
      isFindingScribe
        ? cyberConfig.findingScribeAgent.systemPrompt
        : customAgent
          ? `You are "${customAgent.name}", a user-defined Void Cyber specialist agent.\n\nCUSTOM AGENT INSTRUCTIONS:\n${customAgent.systemPrompt}`
          : cyberConfig.defaultAutoAgent.systemPrompt,
      "",
      selfLearningExcerpt,
      skillsSummary
        ? `BUILT-IN E2B SANDBOX SKILLS (auto-hooked on boot${activeSandboxId ? ` — active sandbox: ${activeSandboxId}` : ""}):\n${skillsSummary}`
        : "",
      hookedSkillDocs
        ? `LOADED SKILL INSTRUCTIONS FROM E2B SANDBOX:\n${hookedSkillDocs}`
        : "",
      program
        ? [
            `OPTIONAL BOUND TARGET PROGRAM: ${program.name} (@${program.programHandle})`,
            program.policyMarkdown
              ? `POLICY:\n${program.policyMarkdown.slice(0, 1200)}`
              : "",
            `IN-SCOPE ASSETS:\n${inScopeList || "None"}`,
            `OUT-OF-SCOPE ASSETS (STRICTLY PROHIBITED):\n${outOfScopeList || "None"}`,
          ]
            .filter(Boolean)
            .join("\n\n")
        : "TARGET MODE: Free-form from chat (follow the target, repository, architecture, or task the user describes directly in chat).",
    ]
      .filter(Boolean)
      .join("\n\n");

    const recentHistory = Array.isArray(body.history)
      ? body.history.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }))
      : [];

    const pinnedModel =
      !customAgent && activeDefaultAgent.model
        ? (parseAgentModel(activeDefaultAgent.model) ?? undefined)
        : undefined;

    try {
      const model = await getModelInstance(pinnedModel, access.session.user.id);
      const result = await generateText({
        model: model as Parameters<typeof generateText>[0]["model"],
        system: systemPrompt,
        messages: [...recentHistory, { role: "user", content: message }],
        maxOutputTokens: 1800,
      });

      // Run Self-Training Playbook updater + Separate Default Finding Scribe agent
      const autoEnabled = body.autoLearnAndLog !== false;
      const automation = autoEnabled
        ? await runPostTurnCyberAutomation({
            userId: access.session.user.id,
            userMessage: message,
            assistantResponse: result.text,
            agentLabel: activeAgentLabel,
            programName: program?.name ?? null,
            forceFindingExtraction: isFindingScribe,
          })
        : {
            learnedAdded: false,
            learnedSummary: null,
            learningEntriesCount: learningFile.entriesCount,
            savedFindings: [],
          };

      return NextResponse.json({
        response: result.text,
        blocked: false,
        agentLabel: activeAgentLabel,
        programName: program?.name ?? null,
        sandboxId: activeSandboxId,
        scopeChecks,
        automation,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Model unavailable";

      const fallback = [
        `**${activeAgentLabel} — Model Provider Unavailable**`,
        "",
        scopeChecks.length > 0
          ? `All referenced targets passed deterministic pre-flight scope validation:\n${scopeChecks.map((c) => `- \`${c.target}\`: ${c.reason}`).join("\n")}`
          : "Your security prompt was validated and logged in the audit trail.",
        "",
        activeSkills.length > 0
          ? `Registered E2B skills ready: ${activeSkills.map((s) => `\`${s.slug}\``).join(", ")}.`
          : "",
        "",
        `Could not reach the configured AI model provider (\`${errMsg.slice(0, 180)}\`). Configure an active model provider key in **Admin -> Model providers** to enable live AI responses.`,
      ]
        .filter(Boolean)
        .join("\n");

      return NextResponse.json({
        response: fallback,
        blocked: false,
        providerUnavailable: true,
        agentLabel: activeAgentLabel,
        programName: program?.name ?? null,
        activeSkills: activeSkills.map((s) => s.slug),
        scopeChecks,
      });
    }
  } finally {
    releaseCyberAgentSlot(access.session.user.id);
  }
}
