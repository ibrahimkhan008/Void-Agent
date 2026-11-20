import { getSession } from "lib/auth/server";
import { getOrBootstrapCyberProfile, requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ userId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  if (session.user.id === userId) {
    const profile = await getOrBootstrapCyberProfile(session);
    return NextResponse.json({ profile: profile ?? null });
  }

  const callerProfile = await getOrBootstrapCyberProfile(session);
  if (!callerProfile || callerProfile.accessTier < 3) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const profile = await cyberRepository.getResearcherProfile(userId);
  return NextResponse.json({ profile: profile ?? null });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const { userId } = await params;

  let body: {
    accessTier?: number;
    role?: string;
    status?: string;
    voidTrustScore?: number;
    mfaEnforced?: boolean;
    maxConcurrentAgents?: number | null;
    maxActiveSessions?: number | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existingProfile = await cyberRepository.getResearcherProfile(userId);
  if (!existingProfile) {
    return NextResponse.json(
      { error: "Researcher profile not found" },
      { status: 404 },
    );
  }

  const clampedTrust =
    typeof body.voidTrustScore === "number" &&
    Number.isFinite(body.voidTrustScore)
      ? Math.min(1000, Math.max(0, Math.round(body.voidTrustScore)))
      : undefined;

  const cleanRole =
    typeof body.role === "string" && body.role.trim()
      ? body.role.trim().slice(0, 32)
      : undefined;

  const cleanMaxAgents =
    body.maxConcurrentAgents === null
      ? null
      : typeof body.maxConcurrentAgents === "number" &&
          Number.isFinite(body.maxConcurrentAgents) &&
          body.maxConcurrentAgents >= 1
        ? Math.floor(body.maxConcurrentAgents)
        : undefined;

  const cleanMaxSessions =
    body.maxActiveSessions === null
      ? null
      : typeof body.maxActiveSessions === "number" &&
          Number.isFinite(body.maxActiveSessions) &&
          body.maxActiveSessions >= 1
        ? Math.floor(body.maxActiveSessions)
        : undefined;

  const updated = await cyberRepository.upsertResearcherProfile({
    userId,
    accessTier: body.accessTier,
    role: cleanRole,
    status: body.status,
    voidTrustScore: clampedTrust,
    mfaEnforced: body.mfaEnforced,
    maxConcurrentAgents: cleanMaxAgents,
    maxActiveSessions: cleanMaxSessions,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "researcher_profile_updated",
      severity: "info",
      details: {
        targetUserId: userId,
        changes: {
          accessTier: body.accessTier,
          role: cleanRole,
          status: body.status,
          voidTrustScore: clampedTrust,
          maxConcurrentAgents: cleanMaxAgents,
          maxActiveSessions: cleanMaxSessions,
        },
      },
    })
    .catch(() => {});

  return NextResponse.json({ researcher: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const { userId } = await params;

  if (userId === access.session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own active admin profile." },
      { status: 400 },
    );
  }

  const deleted = await cyberRepository.deleteResearcherProfile(userId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Researcher profile not found" },
      { status: 404 },
    );
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "researcher_access_deleted",
      severity: "warning",
      details: { targetUserId: userId },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
