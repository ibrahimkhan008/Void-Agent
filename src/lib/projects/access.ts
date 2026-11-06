import "server-only";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionTable,
  ProjectEntity,
  ProjectMemberTable,
  ProjectTable,
  TeamMemberTable,
  TeamTable,
} from "lib/db/pg/schema.pg";
import {
  canCreateProjectForTeam,
  resolveProjectRole,
  resolveTeamProjectRole,
} from "./policy";
import { mergeProjectCollectionSourceOwnerIds } from "./source-scope";

export type ProjectRole = "owner" | "editor" | "viewer";
export type ProjectAccess = { project: ProjectEntity; role: ProjectRole };

/** Resolve current team membership for any team-scoped resource. */
export async function getTeamRole(
  teamId: string,
  userId: string,
): Promise<ProjectRole | null> {
  if (!teamId || !userId) return null;
  const [[team], [membership]] = await Promise.all([
    pgDb
      .select({ ownerId: TeamTable.ownerId })
      .from(TeamTable)
      .where(eq(TeamTable.id, teamId)),
    pgDb
      .select({ role: TeamMemberTable.role })
      .from(TeamMemberTable)
      .where(
        and(
          eq(TeamMemberTable.teamId, teamId),
          eq(TeamMemberTable.userId, userId),
        ),
      ),
  ]);
  return resolveTeamProjectRole(team?.ownerId, membership?.role, userId);
}

export async function listProjectTeamsForUser(userId: string) {
  const [memberships, ownedTeams] = await Promise.all([
    pgDb
      .select({
        id: TeamTable.id,
        name: TeamTable.name,
        role: TeamMemberTable.role,
      })
      .from(TeamMemberTable)
      .innerJoin(TeamTable, eq(TeamMemberTable.teamId, TeamTable.id))
      .where(eq(TeamMemberTable.userId, userId)),
    pgDb
      .select({ id: TeamTable.id, name: TeamTable.name })
      .from(TeamTable)
      .where(eq(TeamTable.ownerId, userId)),
  ]);
  const teams = new Map(
    memberships.map((team) => [
      team.id,
      { ...team, role: team.role === "viewer" ? "viewer" : "editor" },
    ]),
  );
  for (const team of ownedTeams) teams.set(team.id, { ...team, role: "owner" });
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listProjectsForUser(userId: string) {
  const memberships = await pgDb
    .select({ teamId: TeamMemberTable.teamId })
    .from(TeamMemberTable)
    .where(eq(TeamMemberTable.userId, userId));
  const ownedTeams = await pgDb
    .select({ id: TeamTable.id })
    .from(TeamTable)
    .where(eq(TeamTable.ownerId, userId));
  const ownedTeamIds = ownedTeams.map((row) => row.id);
  const projectMemberships = await pgDb
    .select({ projectId: ProjectMemberTable.projectId })
    .from(ProjectMemberTable)
    .where(eq(ProjectMemberTable.userId, userId));
  const memberProjectIds = projectMemberships.map((row) => row.projectId);
  const teamIds = [
    ...new Set([...memberships.map((row) => row.teamId), ...ownedTeamIds]),
  ];
  const conditions = [
    and(eq(ProjectTable.userId, userId), isNull(ProjectTable.teamId)),
  ];
  if (teamIds.length) {
    conditions.push(
      and(
        inArray(ProjectTable.teamId, teamIds),
        or(
          eq(ProjectTable.accessMode, "team"),
          eq(ProjectTable.userId, userId),
          ...(memberProjectIds.length
            ? [inArray(ProjectTable.id, memberProjectIds)]
            : []),
        ),
      ),
    );
  }
  if (ownedTeamIds.length) {
    conditions.push(inArray(ProjectTable.teamId, ownedTeamIds));
  }
  return pgDb
    .select()
    .from(ProjectTable)
    .where(or(...conditions))
    .orderBy(desc(ProjectTable.updatedAt));
}

export async function getProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  const [project] = await pgDb
    .select()
    .from(ProjectTable)
    .where(eq(ProjectTable.id, projectId));
  if (!project) return null;
  if (!project.teamId) {
    return project.userId === userId ? { project, role: "owner" } : null;
  }

  const [team] = await pgDb
    .select({ ownerId: TeamTable.ownerId })
    .from(TeamTable)
    .where(eq(TeamTable.id, project.teamId));
  if (team?.ownerId === userId) return { project, role: "owner" };

  const [[membership], [projectMember]] = await Promise.all([
    pgDb
      .select({ role: TeamMemberTable.role })
      .from(TeamMemberTable)
      .where(
        and(
          eq(TeamMemberTable.teamId, project.teamId),
          eq(TeamMemberTable.userId, userId),
        ),
      ),
    pgDb
      .select({ role: ProjectMemberTable.role })
      .from(ProjectMemberTable)
      .where(
        and(
          eq(ProjectMemberTable.projectId, project.id),
          eq(ProjectMemberTable.userId, userId),
        ),
      ),
  ]);
  const role = resolveProjectRole({
    accessMode: project.accessMode,
    projectOwnerUserId: project.userId,
    teamOwnerId: team?.ownerId,
    teamMembershipRole: membership?.role,
    projectMemberRole: projectMember?.role,
    userId,
  });
  return role ? { project, role } : null;
}

export async function canCreateTeamProject(teamId: string, userId: string) {
  const [team] = await pgDb
    .select({ ownerId: TeamTable.ownerId })
    .from(TeamTable)
    .where(eq(TeamTable.id, teamId));
  if (team?.ownerId === userId) return true;
  const [membership] = await pgDb
    .select({ role: TeamMemberTable.role })
    .from(TeamMemberTable)
    .where(
      and(
        eq(TeamMemberTable.teamId, teamId),
        eq(TeamMemberTable.userId, userId),
      ),
    );
  return canCreateProjectForTeam(team?.ownerId, membership?.role, userId);
}

export async function getProjectCollectionOwnerIds(access: ProjectAccess) {
  const project = access.project;
  if (!project.teamId) return [project.userId];
  const [team, members] = await Promise.all([
    pgDb
      .select({ ownerId: TeamTable.ownerId })
      .from(TeamTable)
      .where(eq(TeamTable.id, project.teamId)),
    pgDb
      .select({ userId: TeamMemberTable.userId })
      .from(TeamMemberTable)
      .where(eq(TeamMemberTable.teamId, project.teamId)),
  ]);
  return [
    ...new Set([
      ...(team[0] ? [team[0].ownerId] : []),
      ...members.map((member) => member.userId),
    ]),
  ];
}

/**
 * Resolve owners of collections explicitly attached to a project that may
 * contribute source rows to its brain. Team-shared collection creators remain
 * valid source owners even if they later leave the team; personal collections
 * still require their owner to be a current project member.
 */
export async function getProjectCollectionSourceOwnerIds(
  access: ProjectAccess,
) {
  const memberIds = await getProjectCollectionOwnerIds(access);
  const { project } = access;
  if (!project.teamId || !project.collectionIds.length) return memberIds;

  const sharedOwners = await pgDb
    .select({ userId: CollectionTable.userId })
    .from(CollectionTable)
    .where(
      and(
        inArray(CollectionTable.id, project.collectionIds),
        eq(CollectionTable.orgId, project.teamId),
      ),
    );
  return mergeProjectCollectionSourceOwnerIds(
    memberIds,
    sharedOwners.map((row) => row.userId),
  );
}

export function mayEditProject(role: ProjectRole) {
  return role === "owner" || role === "editor";
}

export function mayManageProject(role: ProjectRole) {
  return role === "owner";
}
