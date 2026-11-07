import "server-only";

import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ProjectMemberTable,
  ProjectTable,
  TeamMemberTable,
  TeamTable,
} from "lib/db/pg/schema.pg";

export type ProjectNotificationRecipientInput = {
  projectOwnerId: string;
  teamId: string | null;
  accessMode: "team" | "selected";
  teamOwnerId?: string;
  teamMemberIds?: string[];
  projectMemberIds?: string[];
};

/** Resolve only principals that currently pass getProjectAccess for this project. */
export function resolveProjectNotificationRecipientIds(
  input: ProjectNotificationRecipientInput,
): string[] {
  if (!input.teamId) return [input.projectOwnerId];

  const currentTeamMembers = new Set(input.teamMemberIds ?? []);
  const recipients = new Set<string>();
  if (input.teamOwnerId) recipients.add(input.teamOwnerId);

  if (input.accessMode === "team") {
    for (const userId of currentTeamMembers) recipients.add(userId);
  } else {
    const granted = new Set(input.projectMemberIds ?? []);
    for (const userId of granted) {
      if (currentTeamMembers.has(userId)) recipients.add(userId);
    }
  }

  // Project owners keep their role only while they remain a team member; the
  // team owner is already included above even if not represented as a member.
  if (
    input.projectOwnerId === input.teamOwnerId ||
    currentTeamMembers.has(input.projectOwnerId)
  ) {
    recipients.add(input.projectOwnerId);
  }
  return [...recipients];
}

export async function listProjectNotificationRecipientIds(projectId: string) {
  const [project] = await pgDb
    .select({
      projectOwnerId: ProjectTable.userId,
      teamId: ProjectTable.teamId,
      accessMode: ProjectTable.accessMode,
    })
    .from(ProjectTable)
    .where(eq(ProjectTable.id, projectId))
    .limit(1);
  if (!project) return [];
  if (!project.teamId) {
    return resolveProjectNotificationRecipientIds({
      projectOwnerId: project.projectOwnerId,
      teamId: null,
      accessMode: project.accessMode,
    });
  }

  const [[team], members, projectMembers] = await Promise.all([
    pgDb
      .select({ ownerId: TeamTable.ownerId })
      .from(TeamTable)
      .where(eq(TeamTable.id, project.teamId))
      .limit(1),
    pgDb
      .select({ userId: TeamMemberTable.userId })
      .from(TeamMemberTable)
      .where(eq(TeamMemberTable.teamId, project.teamId)),
    pgDb
      .select({ userId: ProjectMemberTable.userId })
      .from(ProjectMemberTable)
      .innerJoin(
        TeamMemberTable,
        and(
          eq(TeamMemberTable.userId, ProjectMemberTable.userId),
          eq(TeamMemberTable.teamId, project.teamId),
        ),
      )
      .where(eq(ProjectMemberTable.projectId, projectId)),
  ]);

  return resolveProjectNotificationRecipientIds({
    projectOwnerId: project.projectOwnerId,
    teamId: project.teamId,
    accessMode: project.accessMode,
    teamOwnerId: team?.ownerId,
    teamMemberIds: members.map((member) => member.userId),
    projectMemberIds: projectMembers.map((member) => member.userId),
  });
}
