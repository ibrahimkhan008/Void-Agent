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
 * Accounts listed in VOID_CYBER_ADMIN_EMAILS (comma-separated) are treated
 * like platform admins for Void Cyber, so an owner whose platform role is not
 * "admin" can still bootstrap the first Tier 3 profile.
 */
export function isCyberBootstrapAdmin(user: {
  role?: string | null;
  email?: string | null;
}): boolean {
  if (getIsUserAdmin({ role: user.role })) return true;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return (process.env.VOID_CYBER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

/**
 * Fetches the user's Void Cyber researcher profile.
 * If no profile exists yet and the user is a platform admin (or listed in
 * VOID_CYBER_ADMIN_EMAILS), automatically bootstraps a Tier 3 admin profile so
 * internal administrators are never locked out on a fresh database.
 */
export async function getOrBootstrapCyberProfile(
  session: AuthSession,
): Promise<CyberResearcherProfile | null> {
  const existing = await cyberRepository.getResearcherProfile(session.user.id);
  if (existing) {
    return existing;
  }

  if (isCyberBootstrapAdmin(session.user)) {
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
