import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const finding = await cyberRepository.getFindingById(id);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  if (
    finding.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const [evidence, reports, session] = await Promise.all([
    cyberRepository.listEvidenceByFinding(id),
    cyberRepository.listReportsByFinding(id),
    finding.sessionId
      ? cyberRepository.getSessionById(finding.sessionId)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ finding, evidence, reports, session });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const finding = await cyberRepository.getFindingById(id);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  if (
    finding.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Partial<{
    status: string;
    severity: string;
    cvssScore: string;
    verificationLog: string;
    remediationGuidance: string;
  }>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updated = await cyberRepository.updateFinding(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: finding.sessionId ?? undefined,
      eventType: "finding_updated",
      severity: "info",
      details: { findingId: id, changes: body },
    })
    .catch(() => {});

  return NextResponse.json({ finding: updated });
}
