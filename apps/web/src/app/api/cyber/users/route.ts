import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const researchers = await cyberRepository.listResearchers({ limit, offset });
  return NextResponse.json({ researchers });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  let body: {
    userId?: string;
    identifier?: string;
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

  const lookup = (body.identifier ?? body.userId ?? "").trim();
  if (!lookup) {
    return NextResponse.json(
      { error: "User email or userId is required" },
      { status: 400 },
    );
  }

  const targetUser = await cyberRepository.findUserByEmailOrId(lookup);
  if (!targetUser) {
    return NextResponse.json(
      { error: `No account found matching '${lookup}'` },
      { status: 404 },
    );
  }

  const researcher = await cyberRepository.upsertResearcherProfile({
    userId: targetUser.id,
    accessTier: body.accessTier ?? 1,
    role: body.role ?? "researcher",
    status: body.status ?? "active",
    voidTrustScore: body.voidTrustScore,
    mfaEnforced: body.mfaEnforced,
    invitedByUserId: access.session.user.id,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "researcher_access_granted",
      severity: "info",
      details: {
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        accessTier: researcher.accessTier,
        role: researcher.role,
      },
    })
    .catch(() => {});

  return NextResponse.json(
    {
      researcher: {
        ...researcher,
        email: targetUser.email,
        name: targetUser.name,
      },
    },
    { status: 201 },
  );
}
