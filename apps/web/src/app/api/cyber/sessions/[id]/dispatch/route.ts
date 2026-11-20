import { generateText } from "ai";
import { getModelInstance } from "lib/ai/models";
import { requireCyberAccess } from "lib/cyber/auth";
import {
  acquireCyberAgentSlot,
  releaseCyberAgentSlot,
  resolveUserCyberQuotas,
} from "lib/cyber/quotas";
import {
  type ProgramScopeAsset,
  evaluateTargetScope,
} from "lib/cyber/scope-matcher";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const AGENT_PERSONAS: Record<string, { label: string; focus: string }> = {
  orchestrator: {
    label: "Void Cyber Orchestrator",
    focus:
      "Coordinate authorized security research, break down testing plans into safe passive-first steps, enforce program scope rules, and guide triage and documentation.",
  },
  recon: {
    label: "Recon Specialist",
    focus:
      "Focus on passive & authorized attack-surface mapping, subdomain/endpoint enumeration strategies, HTTP header/tech-stack analysis, and identifying high-value targets strictly within scope.",
  },
  web: {
    label: "Web Security Specialist",
    focus:
      "Analyze web application security flaws (XSS, CSRF, SSRF, SQLi, IDOR, auth/session flaws, business logic bugs) with non-destructive verification methodologies.",
  },
  api: {
    label: "API Security Specialist",
    focus:
      "Focus on REST/GraphQL/gRPC security (BOLA/IDOR, mass assignment, broken function-level authorization, JWT flaws, rate limiting, schema introspection).",
  },
  verifier: {
    label: "Independent Verifier",
    focus:
      "Critically challenge candidate vulnerabilities, eliminate false positives, verify reproducibility criteria, assess realistic impact/CVSS, and recommend minimal-impact PoCs.",
  },
};

/**
 * Extracts candidate URLs, hostnames, and IPv4 addresses from a command so
 * they can be deterministically checked against program scope BEFORE any
 * model reasoning or tool guidance runs.
 */
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
    // Avoid duplicating a domain already captured inside a full URL
    const alreadyInUrl = Array.from(candidates).some((c) =>
      c.toLowerCase().includes(d.toLowerCase()),
    );
    if (!alreadyInUrl) {
      candidates.add(d.toLowerCase());
    }
  }

  return Array.from(candidates);
}

export async function POST(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(2);
  if (!access.ok) return access.response;

  const { id: sessionId } = await params;
  const cyberSession = await cyberRepository.getSessionById(sessionId);

  if (!cyberSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (
    cyberSession.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (cyberSession.status !== "active") {
    return NextResponse.json(
      { error: "Session is not active. Only active sessions accept commands." },
      { status: 422 },
    );
  }

  let body: {
    command?: string;
    agentMode?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const command = body.command?.trim() ?? "";
  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const agentKey =
    body.agentMode && AGENT_PERSONAS[body.agentMode]
      ? body.agentMode
      : "orchestrator";
  const persona = AGENT_PERSONAS[agentKey];

  // Load program + scopes + current findings for deterministic enforcement & context
  const [program, rawScopes, existingFindings] = await Promise.all([
    cyberRepository.getProgramById(cyberSession.programId),
    cyberRepository.listProgramScopes(cyberSession.programId),
    cyberRepository.listFindingsBySession(sessionId, 20),
  ]);

  const scopes: ProgramScopeAsset[] = rawScopes.map((s) => ({
    id: s.id,
    assetIdentifier: s.assetIdentifier,
    assetType: s.assetType as ProgramScopeAsset["assetType"],
    isInScope: s.isInScope ?? true,
    maxSeverityAllowed: s.maxSeverityAllowed,
    instructionNotes: s.instructionNotes,
  }));

  const rulesMeta = (program?.rulesMetadata ?? {}) as Record<string, unknown>;
  const excludedCategories = Array.isArray(rulesMeta.excludedCategories)
    ? rulesMeta.excludedCategories.filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  // 1. DETERMINISTIC PRE-FLIGHT SCOPE GATE
  const extractedTargets = extractTargetCandidates(command);
  const scopeChecks = extractedTargets.map((target) => ({
    target,
    ...evaluateTargetScope({
      target,
      scopes,
      excludedCategories,
    }),
  }));

  const blockedTargets = scopeChecks.filter((c) => !c.isInScope);
  if (blockedTargets.length > 0) {
    cyberRepository
      .logAuditEvent({
        userId: access.session.user.id,
        sessionId,
        eventType: "scope_breach_prevented",
        severity: "breach",
        details: {
          agentMode: agentKey,
          command: command.slice(0, 500),
          blockedTargets: blockedTargets.map((b) => ({
            target: b.target,
            reason: b.reason,
          })),
        },
      })
      .catch(() => {});

    const blockReport = [
      `**Pre-Flight Scope Gate Blocked Request**`,
      "",
      `One or more targets referenced in your command are **out of scope** for **${program?.name ?? "this program"}**:`,
      "",
      ...blockedTargets.map((b) => `- \`${b.target}\`: ${b.reason}`),
      "",
      "This attempt has been recorded in the immutable audit log. Please restrict all commands to registered in-scope assets.",
    ].join("\n");

    return NextResponse.json({
      response: blockReport,
      blocked: true,
      agentMode: agentKey,
      scopeChecks: scopeChecks.map((c) => ({
        target: c.target,
        status: c.status,
        isInScope: c.isInScope,
        reason: c.reason,
      })),
    });
  }

  // Log authorized command dispatch
  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId,
      eventType: "agent_command_dispatched",
      severity: "info",
      details: {
        agentMode: agentKey,
        command: command.slice(0, 500),
        verifiedTargets: scopeChecks.map((c) => c.target),
      },
    })
    .catch(() => {});

  // 2. ENFORCE CONCURRENT CYBER AGENT QUOTA
  const quotas = await resolveUserCyberQuotas(
    access.session.user.id,
    access.profile,
  );
  const slot = acquireCyberAgentSlot(
    access.session.user.id,
    quotas.maxConcurrentAgents,
  );
  if (!slot.acquired) {
    return NextResponse.json(
      {
        error: `Concurrent Cyber agent limit reached (${slot.running}/${quotas.maxConcurrentAgents} on ${quotas.planLabel}). Wait for an active agent run to finish or ask an owner to increase your plan/user limit.`,
        code: "CYBER_CONCURRENT_AGENT_LIMIT",
        quotas,
      },
      { status: 429 },
    );
  }

  // 3. INVOKE VOID AGENT SECURITY RESEARCH MODEL
  const inScopeSummary = scopes
    .filter((s) => s.isInScope)
    .map(
      (s) =>
        `- ${s.assetIdentifier} (${s.assetType})${s.instructionNotes ? ` — ${s.instructionNotes}` : ""}`,
    )
    .join("\n");

  const outOfScopeSummary = scopes
    .filter((s) => !s.isInScope)
    .map((s) => `- ${s.assetIdentifier} (${s.assetType})`)
    .join("\n");

  const findingsSummary =
    existingFindings.length > 0
      ? existingFindings
          .map(
            (f) =>
              `- [${f.severity.toUpperCase()}] ${f.title} (${f.affectedAsset}) — ${f.status}`,
          )
          .join("\n")
      : "None logged yet.";

  const systemPrompt = [
    `You are the ${persona.label} inside Void Cyber, an authorized internal cybersecurity research platform.`,
    `Role Focus: ${persona.focus}`,
    "",
    "STRICT SAFETY & SCOPE CONTRACT:",
    "1. Only assist with authorized testing against the registered IN-SCOPE assets listed below.",
    "2. Never provide destructive payloads, denial-of-service attacks, persistence implants, or instructions targeting out-of-scope systems.",
    "3. Prioritize minimal-impact proof-of-concept verification and clear remediation guidance.",
    "4. Be concrete, structured, and technical (use markdown lists and code blocks where helpful).",
    "",
    `Program: ${program?.name ?? "Unknown"} (@${program?.programHandle ?? "unknown"})`,
    program?.policyMarkdown
      ? `Policy Summary:\n${program.policyMarkdown.slice(0, 1200)}`
      : "",
    "",
    `IN-SCOPE ASSETS:\n${inScopeSummary || "None"}`,
    "",
    `OUT-OF-SCOPE ASSETS (STRICTLY PROHIBITED):\n${outOfScopeSummary || "None"}`,
    "",
    `CURRENT SESSION FINDINGS:\n${findingsSummary}`,
  ]
    .filter(Boolean)
    .join("\n");

  const recentHistory = Array.isArray(body.history)
    ? body.history.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    : [];

  try {
    const model = await getModelInstance(undefined, access.session.user.id);
    const result = await generateText({
      model: model as Parameters<typeof generateText>[0]["model"],
      system: systemPrompt,
      messages: [...recentHistory, { role: "user", content: command }],
      maxOutputTokens: 1200,
    });

    return NextResponse.json({
      response: result.text,
      blocked: false,
      agentMode: agentKey,
      agentLabel: persona.label,
      scopeChecks: scopeChecks.map((c) => ({
        target: c.target,
        status: c.status,
        isInScope: c.isInScope,
        reason: c.reason,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Model execution failed";

    const fallback = [
      `**${persona.label} — Scope Verified (Model Provider Unavailable)**`,
      "",
      extractedTargets.length > 0
        ? `All referenced targets passed deterministic pre-flight scope checks:\n${scopeChecks.map((c) => `- \`${c.target}\`: ${c.reason}`).join("\n")}`
        : "Command logged and validated against program policy.",
      "",
      `Unable to reach the configured LLM provider right now (\`${message.slice(0, 180)}\`). Configure an active AI provider in Admin -> Providers to enable live specialist reasoning.`,
    ].join("\n");

    return NextResponse.json({
      response: fallback,
      blocked: false,
      agentMode: agentKey,
      agentLabel: persona.label,
      providerUnavailable: true,
      scopeChecks: scopeChecks.map((c) => ({
        target: c.target,
        status: c.status,
        isInScope: c.isInScope,
        reason: c.reason,
      })),
    });
  } finally {
    releaseCyberAgentSlot(access.session.user.id);
  }
}
