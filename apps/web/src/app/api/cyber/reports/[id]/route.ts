import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const report = await cyberRepository.getReportById(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const finding = await cyberRepository.getFindingById(report.findingId);
  if (!finding) {
    return NextResponse.json(
      { error: "Associated finding not found" },
      { status: 404 },
    );
  }

  if (
    finding.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("download") === "1") {
    const updated = await cyberRepository.markReportExported(id);
    cyberRepository
      .logAuditEvent({
        userId: access.session.user.id,
        sessionId: finding.sessionId,
        eventType: "report_exported",
        severity: "info",
        details: { reportId: id, format: report.reportFormat },
      })
      .catch(() => {});
    return NextResponse.json({ report: updated ?? report });
  }

  return NextResponse.json({ report });
}
