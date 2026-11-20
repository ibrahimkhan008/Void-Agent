import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const cyberSession = await cyberRepository.getSessionById(id);
  if (!cyberSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (
    cyberSession.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({ session: cyberSession });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const cyberSession = await cyberRepository.getSessionById(id);
  if (!cyberSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (
    cyberSession.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  if (!["active", "paused", "completed", "archived"].includes(status)) {
    return NextResponse.json(
      { error: "status must be active, paused, completed, or archived" },
      { status: 400 },
    );
  }

  const updated = await cyberRepository.updateSessionStatus(id, status);

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: id,
      eventType: "session_status_updated",
      severity: "info",
      details: { status },
    })
    .catch(() => {});

  return NextResponse.json({ session: updated });
}
