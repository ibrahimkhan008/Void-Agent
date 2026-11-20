import "server-only";

import { generateText } from "ai";
import { getModelInstance } from "lib/ai/models";
import {
  type CyberFinding,
  type CyberLearningFile,
  cyberRepository,
} from "lib/db/pg/repositories/cyber-repository.pg";
import logger from "lib/logger";
import {
  DEFAULT_LEARNING_FILENAME,
  type ExtractedLearningEntry,
  appendLearningEntry,
  buildDefaultLearningFileContent,
  countLearningEntries,
  filterNewFindings,
  parseStructuredJson,
} from "./self-learning-utils";

export {
  DEFAULT_LEARNING_FILENAME,
  FINDING_SCRIBE_AGENT_ID,
  SELF_LEARNING_E2B_MOUNT_PATH,
  appendLearningEntry,
  buildDefaultLearningFileContent,
  countLearningEntries,
} from "./self-learning-utils";

export async function getOrInitializeCyberLearningFile(
  userId: string,
): Promise<CyberLearningFile> {
  const existing = await cyberRepository.getLearningFile(
    userId,
    DEFAULT_LEARNING_FILENAME,
  );
  if (existing) return existing;

  return cyberRepository.upsertLearningFile({
    userId,
    filename: DEFAULT_LEARNING_FILENAME,
    contentMarkdown: buildDefaultLearningFileContent(),
    entriesCount: 0,
    lastLearnedSummary: null,
  });
}

export interface PostTurnCyberAutomationResult {
  learnedAdded: boolean;
  learnedSummary: string | null;
  learningEntriesCount: number;
  savedFindings: Array<{
    id: string;
    title: string;
    severity: string;
    affectedAsset: string;
  }>;
}

/**
 * Post-turn automation executed after a Void Cyber research turn:
 * 1. Self-Trainer: distills new tactics, recon patterns, and pitfalls into the
 *    user's persistent `bugbounty-self-learning.md` self-file.
 * 2. Separate Default Finding Scribe Agent: extracts any concrete discovered
 *    vulnerabilities/bugs and saves them directly into `cyber_finding` so they
 *    appear immediately in the Recent Findings panel in `/cyber/dashboard`.
 */
export async function runPostTurnCyberAutomation({
  userId,
  userMessage,
  assistantResponse,
  agentLabel,
  programName,
  sessionId,
  forceFindingExtraction = false,
}: {
  userId: string;
  userMessage: string;
  assistantResponse: string;
  agentLabel: string;
  programName?: string | null;
  sessionId?: string | null;
  forceFindingExtraction?: boolean;
}): Promise<PostTurnCyberAutomationResult> {
  const learningFile = await getOrInitializeCyberLearningFile(userId);
  let learnedAdded = false;
  let learnedSummary: string | null = null;
  let learningEntriesCount = learningFile.entriesCount;
  const savedFindings: PostTurnCyberAutomationResult["savedFindings"] = [];

  try {
    const model = await getModelInstance(undefined, userId);

    // Run both the Self-Trainer distillation and the separate default Finding Scribe
    // in a single tight JSON call so latency stays low while keeping distinct schemas.
    const extractorPrompt = [
      "You are the background Void Cyber Self-Trainer & Finding Scribe coordinator.",
      "Analyze the latest bug bounty / cybersecurity conversation turn below and return STRICT JSON ONLY (no prose outside JSON):",
      "{",
      '  "learning": {',
      '    "shouldSave": boolean,',
      '    "topic": "short topic title (e.g. GraphQL BOLA Bypass or Cloudflare Worker Auth Audit)",',
      '    "targetContext": "optional target/tech stack summary",',
      '    "lessons": ["concrete reusable lesson learned"],',
      '    "tactics": ["specific check, command, or verification pattern worth reusing"],',
      '    "pitfalls": ["false positive or edge case to remember"]',
      "  },",
      '  "findings": [',
      "    {",
      '      "title": "Specific vulnerability title",',
      '      "severity": "critical|high|medium|low|info",',
      '      "affectedAsset": "domain, URL, endpoint, repo, or component",',
      '      "cweId": "optional CWE-xxx",',
      '      "cvssScore": "optional score like 7.5",',
      '      "reproductionSteps": "concise step-by-step reproduction",',
      '      "proofOfConcept": "concrete payload, curl command, or verification evidence",',
      '      "impactDescription": "clear security impact",',
      '      "remediationGuidance": "concrete fix recommendation"',
      "    }",
      "  ]",
      "}",
      "",
      "RULES:",
      "1. Set learning.shouldSave = true whenever the turn contains actionable security methodology, recon heuristics, vulnerability patterns, payloads, or architectural takeaways worth remembering across future bug bounty runs.",
      forceFindingExtraction
        ? "2. The user explicitly invoked the Finding Scribe agent — extract EVERY vulnerability or candidate bug described in the user prompt or assistant response into `findings[]`."
        : "2. Only populate `findings[]` when the user or agent actually identified/confirmed a specific vulnerability or candidate bug on a concrete target/endpoint/component (NOT generic checklists or hypothetical advice).",
      "3. Keep each string concise, technical, and factual. Return valid JSON only.",
    ].join("\n");

    const turnContext = [
      `Active Agent: ${agentLabel}`,
      programName ? `Target Program: ${programName}` : "Target Mode: Free-form",
      "",
      "USER PROMPT:",
      userMessage.slice(0, 2500),
      "",
      "AGENT RESPONSE:",
      assistantResponse.slice(0, 4000),
    ].join("\n");

    const extraction = await generateText({
      model: model as Parameters<typeof generateText>[0]["model"],
      system: extractorPrompt,
      messages: [{ role: "user", content: turnContext }],
      maxOutputTokens: 1000,
    });

    const parsed = parseStructuredJson<{
      learning?: ExtractedLearningEntry & { shouldSave?: boolean };
      findings?: unknown[];
    }>(extraction.text);

    // 1. Update Self-Learning Playbook File
    if (parsed?.learning?.shouldSave) {
      const appended = appendLearningEntry(
        learningFile.contentMarkdown,
        parsed.learning,
      );
      if (appended.added) {
        const nextCount = countLearningEntries(appended.markdown);
        await cyberRepository.upsertLearningFile({
          userId,
          filename: DEFAULT_LEARNING_FILENAME,
          contentMarkdown: appended.markdown,
          entriesCount: nextCount,
          lastLearnedSummary: appended.summary,
        });
        learnedAdded = true;
        learnedSummary = appended.summary;
        learningEntriesCount = nextCount;
      }
    }

    // 2. Separate Default Finding Scribe Agent -> Save Bugs to Recent Findings
    if (Array.isArray(parsed?.findings) && parsed.findings.length > 0) {
      const existingRecent = await cyberRepository.listFindingsByUser(
        userId,
        40,
      );
      const newBugs = filterNewFindings(parsed.findings, existingRecent);

      for (const bug of newBugs) {
        const created: CyberFinding = await cyberRepository.createFinding({
          sessionId: sessionId ?? null,
          userId,
          title: bug.title,
          severity: bug.severity,
          affectedAsset: bug.affectedAsset,
          cweId: bug.cweId,
          cvssScore: bug.cvssScore,
          status: "candidate",
          reproductionSteps: bug.reproductionSteps,
          proofOfConcept: bug.proofOfConcept,
          impactDescription: bug.impactDescription,
          remediationGuidance: bug.remediationGuidance,
          rawToolOutputs: {
            loggedBy: "finding-scribe",
            source: "cyber_chat",
            agentLabel,
          },
        });

        savedFindings.push({
          id: created.id,
          title: created.title,
          severity: created.severity,
          affectedAsset: created.affectedAsset,
        });

        cyberRepository
          .logAuditEvent({
            userId,
            sessionId: sessionId ?? undefined,
            eventType: "finding_auto_saved_by_scribe",
            severity: "info",
            details: {
              findingId: created.id,
              title: created.title,
              severity: created.severity,
              affectedAsset: created.affectedAsset,
            },
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    logger.warn(
      "[cyber-self-learning] post-turn automation skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    learnedAdded,
    learnedSummary,
    learningEntriesCount,
    savedFindings,
  };
}
