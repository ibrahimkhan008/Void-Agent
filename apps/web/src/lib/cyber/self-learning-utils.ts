export const FINDING_SCRIBE_AGENT_ID = "builtin:finding-scribe";
export const DEFAULT_LEARNING_FILENAME = "bugbounty-self-learning.md";
export const SELF_LEARNING_E2B_MOUNT_PATH =
  "/home/user/skills/self-learned/SKILL.md";

export interface ExtractedLearningEntry {
  topic: string;
  targetContext?: string;
  lessons: string[];
  tactics?: string[];
  pitfalls?: string[];
}

export interface ExtractedBugFinding {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  affectedAsset: string;
  cweId?: string;
  cvssScore?: string;
  reproductionSteps: string;
  proofOfConcept: string;
  impactDescription: string;
  remediationGuidance?: string;
}

export function buildDefaultLearningFileContent(): string {
  return [
    "# Void Cyber — Bug Bounty Self-Learning Playbook",
    "",
    "> Automatically maintained by Void Cyber agents while working on security audits & bug bounties.",
    `> Mounted inside E2B sandboxes at \`${SELF_LEARNING_E2B_MOUNT_PATH}\` on boot.`,
    "",
    "---",
    "",
  ].join("\n");
}

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

export function normalizeFindingSeverity(
  value: unknown,
): ExtractedBugFinding["severity"] {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "medium";
  if (VALID_SEVERITIES.has(s)) {
    return s as ExtractedBugFinding["severity"];
  }
  return "medium";
}

/**
 * Safely parses a JSON object from an LLM response that may include markdown
 * code fences or surrounding prose.
 */
export function parseStructuredJson<T>(raw: string): T | null {
  if (!raw || typeof raw !== "string") return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Appends a structured, timestamped self-training section to the agent's
 * Markdown playbook file, deduplicating against already-recorded lessons.
 */
export function appendLearningEntry(
  existingMarkdown: string,
  entry: ExtractedLearningEntry,
  timestampIso = new Date().toISOString(),
): {
  markdown: string;
  added: boolean;
  summary: string;
} {
  const base = existingMarkdown?.trim()
    ? existingMarkdown.trimEnd()
    : buildDefaultLearningFileContent().trimEnd();

  const normalizedExisting = base.toLowerCase();
  const cleanLessons = (entry.lessons ?? [])
    .map((l) => l.trim())
    .filter(
      (l) => l.length >= 12 && !normalizedExisting.includes(l.toLowerCase()),
    );
  const cleanTactics = (entry.tactics ?? [])
    .map((t) => t.trim())
    .filter(
      (t) => t.length >= 10 && !normalizedExisting.includes(t.toLowerCase()),
    );
  const cleanPitfalls = (entry.pitfalls ?? [])
    .map((p) => p.trim())
    .filter(
      (p) => p.length >= 10 && !normalizedExisting.includes(p.toLowerCase()),
    );

  if (
    cleanLessons.length === 0 &&
    cleanTactics.length === 0 &&
    cleanPitfalls.length === 0
  ) {
    return { markdown: `${base}\n`, added: false, summary: "" };
  }

  const dateStamp = timestampIso.slice(0, 16).replace("T", " ") + " UTC";
  const topic = (entry.topic || "Bug Bounty Research Insight")
    .trim()
    .slice(0, 120);
  const targetLine = entry.targetContext?.trim()
    ? `**Target / Context:** ${entry.targetContext.trim().slice(0, 160)}`
    : null;

  const sectionLines: string[] = [
    "",
    `## ${dateStamp} — ${topic}`,
    ...(targetLine ? [targetLine] : []),
  ];

  if (cleanLessons.length > 0) {
    sectionLines.push(
      "",
      "### Key Takeaways",
      ...cleanLessons.map((l) => `- ${l}`),
    );
  }
  if (cleanTactics.length > 0) {
    sectionLines.push(
      "",
      "### Working Tactics & Payloads",
      ...cleanTactics.map((t) => `- ${t}`),
    );
  }
  if (cleanPitfalls.length > 0) {
    sectionLines.push(
      "",
      "### Pitfalls & False Positives Avoided",
      ...cleanPitfalls.map((p) => `- ${p}`),
    );
  }

  sectionLines.push("", "---");

  // Cap file size gracefully (~80KB) while keeping header + newest sections
  let nextMarkdown = `${base}\n${sectionLines.join("\n")}\n`;
  if (nextMarkdown.length > 80_000) {
    const header = buildDefaultLearningFileContent();
    const tail = nextMarkdown.slice(-72_000);
    const nextHeading = tail.indexOf("\n## ");
    nextMarkdown = `${header}${nextHeading >= 0 ? tail.slice(nextHeading + 1) : tail}`;
  }

  const summary =
    `${topic}: ${cleanLessons[0] ?? cleanTactics[0] ?? cleanPitfalls[0]}`.slice(
      0,
      220,
    );

  return {
    markdown: nextMarkdown,
    added: true,
    summary,
  };
}

/**
 * Counts how many learned sections exist in a self-learning Markdown file.
 */
export function countLearningEntries(markdown: string): number {
  const matches = markdown.match(/^##\s+/gm);
  return matches ? matches.length : 0;
}

/**
 * Sanitizes and deduplicates candidate bugs extracted by the separate
 * default Finding Scribe agent before persisting to `cyber_finding`.
 */
export function filterNewFindings(
  candidates: unknown[],
  existingFindings: Array<{ title: string; affectedAsset: string }>,
): ExtractedBugFinding[] {
  const seenKeys = new Set(
    existingFindings.map(
      (f) =>
        `${f.title.trim().toLowerCase()}::${f.affectedAsset.trim().toLowerCase()}`,
    ),
  );

  const valid: ExtractedBugFinding[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const affectedAsset =
      typeof rec.affectedAsset === "string" ? rec.affectedAsset.trim() : "";

    if (title.length < 5 || affectedAsset.length < 2) continue;

    const dedupeKey = `${title.toLowerCase()}::${affectedAsset.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    valid.push({
      title: title.slice(0, 250),
      severity: normalizeFindingSeverity(rec.severity),
      affectedAsset: affectedAsset.slice(0, 300),
      cweId:
        typeof rec.cweId === "string" && rec.cweId.trim()
          ? rec.cweId.trim().slice(0, 32)
          : undefined,
      cvssScore:
        typeof rec.cvssScore === "string" && rec.cvssScore.trim()
          ? rec.cvssScore.trim().slice(0, 16)
          : undefined,
      reproductionSteps:
        typeof rec.reproductionSteps === "string" &&
        rec.reproductionSteps.trim()
          ? rec.reproductionSteps.trim()
          : "Documented during Void Cyber research session.",
      proofOfConcept:
        typeof rec.proofOfConcept === "string" && rec.proofOfConcept.trim()
          ? rec.proofOfConcept.trim()
          : "# Captured by Finding Scribe agent from Void Cyber chat",
      impactDescription:
        typeof rec.impactDescription === "string" &&
        rec.impactDescription.trim()
          ? rec.impactDescription.trim()
          : title,
      remediationGuidance:
        typeof rec.remediationGuidance === "string" &&
        rec.remediationGuidance.trim()
          ? rec.remediationGuidance.trim()
          : undefined,
    });
  }

  return valid.slice(0, 5);
}
