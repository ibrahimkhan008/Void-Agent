import { requireCyberAccess } from "lib/cyber/auth";
import { evaluateFindingQuality } from "lib/cyber/report-compiler";
import {
  type ProgramScopeAsset,
  evaluateTargetScope,
} from "lib/cyber/scope-matcher";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/**
 * Independent Verification Agent
 * Deterministically validates a finding against:
 * 1. Program Scope Compliance (verifies affectedAsset is in-scope)
 * 2. Evidence & Reproducibility Completeness (quality score + evidence vault)
 * 3. Writes an immutable verification log and transitions status to "verified"
 *    when all mandatory gates pass.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id: findingId } = await params;
  const finding = await cyberRepository.getFindingById(findingId);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  if (
    finding.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const cyberSession = finding.sessionId
    ? await cyberRepository.getSessionById(finding.sessionId)
    : null;
  const rawScopes = cyberSession
    ? await cyberRepository.listProgramScopes(cyberSession.programId)
    : [];

  const scopes: ProgramScopeAsset[] = rawScopes.map((s) => ({
    id: s.id,
    assetIdentifier: s.assetIdentifier,
    assetType: s.assetType as ProgramScopeAsset["assetType"],
    isInScope: s.isInScope ?? true,
    maxSeverityAllowed: s.maxSeverityAllowed,
    instructionNotes: s.instructionNotes,
  }));

  const scopeEval =
    scopes.length > 0
      ? evaluateTargetScope({
          target: finding.affectedAsset,
          scopes,
        })
      : {
          status: "free_form",
          isInScope: true,
          reason:
            "Free-form research finding (no bound target program scope rules).",
        };

  const evidence = await cyberRepository.listEvidenceByFinding(findingId);
  const quality = evaluateFindingQuality(finding);

  const checks = [
    {
      name: "Target Scope Compliance",
      passed: scopeEval.isInScope,
      detail: scopeEval.reason,
    },
    {
      name: "Reproduction Steps",
      passed: finding.reproductionSteps.trim().length >= 30,
      detail:
        finding.reproductionSteps.trim().length >= 30
          ? "Step-by-step reproduction instructions present."
          : "Reproduction steps are too brief (minimum 30 characters required).",
    },
    {
      name: "Proof of Concept",
      passed: finding.proofOfConcept.trim().length >= 15,
      detail:
        finding.proofOfConcept.trim().length >= 15
          ? "Proof of Concept artifact present."
          : "Proof of Concept is missing or too brief.",
    },
    {
      name: "Impact Analysis",
      passed: finding.impactDescription.trim().length >= 20,
      detail:
        finding.impactDescription.trim().length >= 20
          ? "Impact analysis documented."
          : "Impact description is missing or too brief.",
    },
    {
      name: "Evidence Vault",
      passed: evidence.length > 0,
      detail:
        evidence.length > 0
          ? `${evidence.length} SHA-256 hashed evidence artifact(s) attached.`
          : "No cryptographic evidence attached yet (recommended for high-confidence triage).",
    },
  ];

  // Mandatory gates: scope + repro + PoC + impact
  const mandatoryPassed = checks.slice(0, 4).every((c) => c.passed);
  const timestamp = new Date().toISOString();

  const verificationLog = [
    `Independent Verification Run — ${timestamp}`,
    `Outcome: ${mandatoryPassed ? "VERIFIED" : "NEEDS_ATTENTION"} (Quality Score: ${quality.score}/100)`,
    "",
    ...checks.map(
      (c) => `[${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`,
    ),
    ...(quality.feedback.length > 0
      ? ["", "Recommendations:", ...quality.feedback.map((tip) => `- ${tip}`)]
      : []),
  ].join("\n");

  const nextStatus = mandatoryPassed ? "verified" : finding.status;

  const updated = await cyberRepository.updateFinding(findingId, {
    status: nextStatus,
    verificationLog,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: finding.sessionId ?? undefined,
      eventType: "finding_verified",
      severity: mandatoryPassed ? "info" : "warning",
      details: {
        findingId,
        verified: mandatoryPassed,
        qualityScore: quality.score,
        scopeStatus: scopeEval.status,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    finding: updated,
    verified: mandatoryPassed,
    qualityScore: quality.score,
    checks,
  });
}
