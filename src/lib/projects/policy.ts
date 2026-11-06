import type { ProjectRole } from "./access";

export function resolveTeamProjectRole(
  teamOwnerId: string | undefined,
  membershipRole: string | undefined,
  userId: string,
): ProjectRole | null {
  if (teamOwnerId === userId) return "owner";
  if (!membershipRole) return null;
  return membershipRole === "viewer" ? "viewer" : "editor";
}

/**
 * Resolve project access without changing legacy team-wide behavior. Selected
 * mode requires a current team member and an explicit project grant; team
 * owners retain their existing owner access in both modes.
 */
export function resolveProjectRole(input: {
  accessMode: "team" | "selected" | null | undefined;
  projectOwnerUserId: string;
  teamOwnerId: string | undefined;
  teamMembershipRole: string | undefined;
  projectMemberRole: "viewer" | "editor" | undefined;
  userId: string;
}): ProjectRole | null {
  if (input.teamOwnerId === input.userId) return "owner";
  const teamRole = resolveTeamProjectRole(
    input.teamOwnerId,
    input.teamMembershipRole,
    input.userId,
  );
  if (!teamRole) return null;
  // The creator retains the access level they already had before opting into
  // the selected-member mode; only other team members need an explicit grant.
  if (input.projectOwnerUserId === input.userId) return teamRole;
  if (input.accessMode === "selected") return input.projectMemberRole ?? null;
  return teamRole;
}

export function canCreateProjectForTeam(
  teamOwnerId: string | undefined,
  membershipRole: string | undefined,
  userId: string,
) {
  return (
    teamOwnerId === userId ||
    membershipRole === "admin" ||
    membershipRole === "member"
  );
}

export function isProjectCollectionScopeAllowed(
  requestedCollectionIds: string[],
  attachedCollectionIds: string[],
) {
  const attached = new Set(attachedCollectionIds);
  return requestedCollectionIds.every((id) => attached.has(id));
}
