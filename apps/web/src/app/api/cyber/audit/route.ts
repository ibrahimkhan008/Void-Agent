import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Audit trail is strictly restricted to Admin / Owner (Tier 3)
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const scopeAll = url.searchParams.get("scope") !== "self";
  const sessionId = url.searchParams.get("sessionId") || undefined;
  const severityFilter = url.searchParams.get("severity") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 200);

  const events = await cyberRepository.listAuditEvents({
    userId: scopeAll ? undefined : access.session.user.id,
    sessionId,
    limit,
  });

  const filtered = severityFilter
    ? events.filter((e) => e.severity === severityFilter)
    : events;

  return NextResponse.json({
    events: filtered,
    canViewAll: true,
  });
}
