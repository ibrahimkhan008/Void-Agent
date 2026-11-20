import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const scopeAll =
    url.searchParams.get("scope") === "all" && access.profile.accessTier >= 3;
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
    canViewAll: access.profile.accessTier >= 3,
  });
}
