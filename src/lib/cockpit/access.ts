import "server-only";

import { getTeamRole } from "lib/projects/access";
import type { StripeConnectionScope } from "./stripe";

export type StripeScopeResolution =
  | { ok: true; scope: StripeConnectionScope; canManage: boolean }
  | { ok: false };

/** Resolve membership before reading shared team data or changing a key. */
export async function resolveStripeScope(
  userId: string,
  teamId: string | null,
): Promise<StripeScopeResolution> {
  if (!teamId)
    return { ok: true, scope: { userId, teamId: null }, canManage: true };
  const role = await getTeamRole(teamId, userId);
  if (!role) return { ok: false };
  return {
    ok: true,
    scope: { userId, teamId },
    canManage: role === "owner" || role === "editor",
  };
}
