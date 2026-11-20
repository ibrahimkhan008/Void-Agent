import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const severityFilter = url.searchParams.get("severity");
  const statusFilter = url.searchParams.get("status");
  const limitParam = Number(url.searchParams.get("limit") ?? "50");

  let findings;
  if (sessionId) {
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
    findings = await cyberRepository.listFindingsBySession(
      sessionId,
      limitParam,
    );
  } else {
    findings = await cyberRepository.listFindingsByUser(
      access.session.user.id,
      limitParam,
    );
  }

  const filtered = findings.filter((f) => {
    if (severityFilter && f.severity !== severityFilter) return false;
    if (statusFilter && f.status !== statusFilter) return false;
    return true;
  });

  return NextResponse.json({ findings: filtered });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    sessionId: string;
    title: string;
    description?: string;
    severity: string;
    cvssScore?: string;
    cweId?: string;
    affectedAsset: string;
    proofOfConcept?: string;
    pocMarkdown?: string;
    affectedEndpoints?: string[];
    reproductionSteps?: string;
    impactDescription?: string;
    remediationGuidance?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.sessionId ||
    !body.title?.trim() ||
    !body.severity ||
    !body.affectedAsset?.trim()
  ) {
    return NextResponse.json(
      { error: "sessionId, title, severity, and affectedAsset are required" },
      { status: 400 },
    );
  }

  const cyberSession = await cyberRepository.getSessionById(body.sessionId);
  if (!cyberSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (
    cyberSession.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const finding = await cyberRepository.createFinding({
    sessionId: body.sessionId,
    userId: access.session.user.id,
    title: body.title.trim(),
    severity: body.severity.toLowerCase(),
    cweId: body.cweId?.trim() || undefined,
    cvssScore: body.cvssScore?.trim() || undefined,
    affectedAsset: body.affectedAsset.trim(),
    reproductionSteps: body.reproductionSteps ?? body.description ?? "",
    proofOfConcept: body.proofOfConcept ?? body.pocMarkdown ?? "",
    impactDescription: body.impactDescription ?? body.description ?? "",
    remediationGuidance: body.remediationGuidance?.trim() || undefined,
    rawToolOutputs: body.affectedEndpoints
      ? { affectedEndpoints: body.affectedEndpoints }
      : {},
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: body.sessionId,
      eventType: "finding_created",
      severity: "info",
      details: {
        findingId: finding.id,
        severity: finding.severity,
        affectedAsset: finding.affectedAsset,
      },
    })
    .catch(() => {});

  return NextResponse.json({ finding }, { status: 201 });
}
