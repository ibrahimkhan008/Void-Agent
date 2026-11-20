import "server-only";

import { getSession } from "lib/auth/server";
import {
  type CyberResearcherProfile,
  cyberRepository,
} from "lib/db/pg/repositories/cyber-repository.pg";
import { getIsUserAdmin } from "lib/user/utils";
import { NextResponse } from "next/server";

type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * Fetches the user's Void Cyber researcher profile.
 * If no profile exists yet and the user is a platform admin, automatically
 * bootstraps a Tier 3 admin profile so internal administrators are never
 * locked out on a fresh database.
 */
export async function getOrBootstrapCyberProfile(
  session: AuthSession,
): Promise<CyberResearcherProfile | null> {
  const existing = await cyberRepository.getResearcherProfile(session.user.id);
  if (existing) {
    return existing;
  }

  if (getIsUserAdmin({ role: session.user.role })) {
    const bootstrapped = await cyberRepository.upsertResearcherProfile({
      userId: session.user.id,
      accessTier: 3,
      role: "admin",
      status: "active",
      voidTrustScore: 1000,
      mfaEnforced: false,
    });
    cyberRepository
      .logAuditEvent({
        userId: session.user.id,
        eventType: "admin_profile_bootstrapped",
        severity: "info",
        details: { accessTier: 3, role: "admin" },
      })
      .catch(() => {});
    return bootstrapped;
  }

  return null;
}

export type CyberAccessResult =
  | {
      ok: true;
      session: AuthSession;
      profile: CyberResearcherProfile;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Enforces authentication, active cyber profile status, and minimum tier.
 */
export async function requireCyberAccess(
  minTier = 1,
): Promise<CyberAccessResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const profile = await getOrBootstrapCyberProfile(session);
  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cyber access not granted" },
        { status: 403 },
      ),
    };
  }

  if (profile.status !== "active") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Cyber researcher account is ${profile.status}` },
        { status: 403 },
      ),
    };
  }

  if (profile.accessTier < minTier) {
    const tierMessage =
      minTier >= 3
        ? "Admin access required (Tier 3)"
        : `Insufficient tier — requires Tier ${minTier} or higher`;
    return {
      ok: false,
      response: NextResponse.json({ error: tierMessage }, { status: 403 }),
    };
  }

  return { ok: true, session, profile };
}
