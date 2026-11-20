/**
 * Structured Vulnerability Report Compiler & Quality Scorer
 * Pure TypeScript engine that compiles findings into Markdown or JSON
 * reports and computes an actionable 0-100 report quality score.
 */

export interface ReportFindingInput {
  id: string;
  title: string;
  severity: string;
  status: string;
  affectedAsset: string;
  cweId?: string | null;
  cvssScore?: string | null;
  reproductionSteps: string;
  proofOfConcept: string;
  impactDescription: string;
  remediationGuidance?: string | null;
  verificationLog?: string | null;
  createdAt?: Date | string;
}

export interface CompiledReportResult {
  markdown: string;
  qualityScore: number;
  qualityFeedback: string[];
  payload: Record<string, unknown>;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function evaluateFindingQuality(finding: ReportFindingInput): {
  score: number;
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  if (finding.title.trim().length >= 10) {
    score += 10;
  } else {
    feedback.push("Title should be descriptive (at least 10 characters).");
  }

  if (finding.affectedAsset.trim().length > 0) {
    score += 10;
  } else {
    feedback.push("Specify the exact affected asset or endpoint.");
  }

  if (finding.cweId?.trim()) {
    score += 10;
  } else {
    feedback.push(
      "Add a CWE identifier (e.g., CWE-89, CWE-79) for triage clarity.",
    );
  }

  if (finding.cvssScore?.trim()) {
    score += 10;
  } else {
    feedback.push("Include a CVSS v3.1 score to justify severity.");
  }

  if (finding.reproductionSteps.trim().length >= 40) {
    score += 20;
  } else {
    feedback.push("Provide detailed step-by-step reproduction instructions.");
  }

  if (finding.proofOfConcept.trim().length >= 20) {
    score += 15;
  } else {
    feedback.push(
      "Include a clear Proof of Concept payload or HTTP request/response.",
    );
  }

  if (finding.impactDescription.trim().length >= 30) {
    score += 15;
  } else {
    feedback.push("Explain the concrete security and business impact.");
  }

  if (
    finding.remediationGuidance &&
    finding.remediationGuidance.trim().length >= 20
  ) {
    score += 10;
  } else {
    feedback.push("Add actionable remediation guidance for engineering teams.");
  }

  return { score: Math.min(score, 100), feedback };
}

export function compileVulnerabilityReport({
  findings,
  format,
  generatedBy,
  programName,
}: {
  findings: ReportFindingInput[];
  format: string;
  generatedBy: string;
  programName?: string;
}): CompiledReportResult {
  const sorted = [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity.toLowerCase()] ?? 99) -
      (SEVERITY_ORDER[b.severity.toLowerCase()] ?? 99),
  );

  const generatedAt = new Date().toISOString();
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  let totalScore = 0;
  const feedbackSet = new Set<string>();

  for (const f of sorted) {
    const key = f.severity.toLowerCase();
    severityCounts[key] = (severityCounts[key] ?? 0) + 1;
    const q = evaluateFindingQuality(f);
    totalScore += q.score;
    for (const tip of q.feedback) {
      feedbackSet.add(`${f.title}: ${tip}`);
    }
  }

  const qualityScore =
    sorted.length > 0 ? Math.round(totalScore / sorted.length) : 0;
  const qualityFeedback = Array.from(feedbackSet);

  const lines: string[] = [
    `# Void Cyber Security Assessment Report`,
    "",
    programName ? `**Target Program:** ${programName}` : "",
    `**Generated At:** ${generatedAt}`,
    `**Total Findings:** ${sorted.length}`,
    `**Report Quality Score:** ${qualityScore}/100`,
    "",
    "## Executive Summary",
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| Critical | ${severityCounts.critical} |`,
    `| High | ${severityCounts.high} |`,
    `| Medium | ${severityCounts.medium} |`,
    `| Low | ${severityCounts.low} |`,
    `| Informational | ${severityCounts.info} |`,
    "",
    "---",
    "",
  ].filter((line, idx) => !(idx === 2 && line === ""));

  sorted.forEach((f, index) => {
    lines.push(`## ${index + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push("");
    lines.push(`- **Affected Asset:** \`${f.affectedAsset}\``);
    lines.push(`- **Severity:** ${f.severity.toUpperCase()}`);
    lines.push(`- **Status:** ${f.status}`);
    if (f.cweId) lines.push(`- **CWE:** ${f.cweId}`);
    if (f.cvssScore) lines.push(`- **CVSS Score:** ${f.cvssScore}`);
    lines.push("");

    lines.push("### Impact");
    lines.push("");
    lines.push(f.impactDescription || "_Not specified._");
    lines.push("");

    lines.push("### Steps to Reproduce");
    lines.push("");
    lines.push(f.reproductionSteps || "_Not specified._");
    lines.push("");

    lines.push("### Proof of Concept");
    lines.push("");
    lines.push("```");
    lines.push(f.proofOfConcept || "# No PoC provided");
    lines.push("```");
    lines.push("");

    if (f.remediationGuidance) {
      lines.push("### Remediation Guidance");
      lines.push("");
      lines.push(f.remediationGuidance);
      lines.push("");
    }

    if (f.verificationLog) {
      lines.push("### Independent Verification Log");
      lines.push("");
      lines.push(f.verificationLog);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  const markdown = lines.join("\n");

  const payload: Record<string, unknown> = {
    reportFormat: format,
    programName: programName ?? null,
    generatedAt,
    generatedBy,
    qualityScore,
    qualityFeedback,
    findingCount: sorted.length,
    severitySummary: severityCounts,
    markdown,
    findings: sorted.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      status: f.status,
      affectedAsset: f.affectedAsset,
      cvssScore: f.cvssScore ?? null,
      cweId: f.cweId ?? null,
      reproductionSteps: f.reproductionSteps,
      proofOfConcept: f.proofOfConcept,
      impactDescription: f.impactDescription,
      remediationGuidance: f.remediationGuidance ?? null,
      verificationLog: f.verificationLog ?? null,
    })),
  };

  return { markdown, qualityScore, qualityFeedback, payload };
}
