import { requireCyberAccess } from "lib/cyber/auth";
import { compileVulnerabilityReport } from "lib/cyber/report-compiler";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const findingId = url.searchParams.get("findingId");

  if (findingId) {
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
    const reports = await cyberRepository.listReportsByFinding(findingId);
    return NextResponse.json({ reports });
  }

  const findings = await cyberRepository.listFindingsByUser(
    access.session.user.id,
    200,
  );
  const allReports = (
    await Promise.all(
      findings.map((f) => cyberRepository.listReportsByFinding(f.id)),
    )
  )
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return NextResponse.json({ reports: allReports });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    findingIds?: string[];
    findingId?: string;
    format?: string;
    reportFormat?: string;
    compiledPayload?: Record<string, unknown>;
    qualityScore?: number;
    qualityFeedback?: unknown[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const findingIds =
    body.findingIds ?? (body.findingId ? [body.findingId] : []);
  const reportFormat = (
    body.format ??
    body.reportFormat ??
    "markdown"
  ).toLowerCase();

  if (findingIds.length === 0) {
    return NextResponse.json(
      { error: "At least one findingId is required" },
      { status: 400 },
    );
  }

  const fetched = await Promise.all(
    findingIds.map((id) => cyberRepository.getFindingById(id)),
  );
  const validFindings = fetched.filter(
    (f): f is NonNullable<typeof f> => f !== null,
  );

  if (validFindings.length === 0) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  const unauthorized = validFindings.some(
    (f) => f.userId !== access.session.user.id && access.profile.accessTier < 3,
  );
  if (unauthorized) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const firstFinding = validFindings[0];
  let programName: string | undefined;
  const cyberSession = firstFinding.sessionId
    ? await cyberRepository.getSessionById(firstFinding.sessionId)
    : null;
  if (cyberSession) {
    const program = await cyberRepository.getProgramById(
      cyberSession.programId,
    );
    programName = program?.name;
  }

  const compiled = compileVulnerabilityReport({
    findings: validFindings,
    format: reportFormat,
    generatedBy: access.session.user.email ?? access.session.user.id,
    programName,
  });

  const report = await cyberRepository.createReport({
    findingId: firstFinding.id,
    reportFormat,
    compiledPayload: body.compiledPayload ?? compiled.payload,
    qualityScore: body.qualityScore ?? compiled.qualityScore,
    qualityFeedback: body.qualityFeedback ?? compiled.qualityFeedback,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: firstFinding.sessionId ?? undefined,
      eventType: "report_compiled",
      severity: "info",
      details: {
        reportId: report.id,
        findingCount: validFindings.length,
        format: reportFormat,
        qualityScore: report.qualityScore,
      },
    })
    .catch(() => {});

  return NextResponse.json({ report }, { status: 201 });
}
