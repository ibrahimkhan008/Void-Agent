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

  const updated = await cyberRepository.upsertResearcherProfile({
    userId,
    accessTier: body.accessTier,
    role: body.role,
    status: body.status,
    voidTrustScore: body.voidTrustScore,
    mfaEnforced: body.mfaEnforced,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "researcher_profile_updated",
      severity: "info",
      details: {
        targetUserId: userId,
        changes: body,
      },
    })
    .catch(() => {});

  return NextResponse.json({ researcher: updated });
}
