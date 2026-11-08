import "server-only";

import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  hashTeamInvitationToken,
  normalizeInvitationEmail,
} from "lib/team-invitations";
import { pgDb as db } from "../db.pg";
import {
  TeamInvitationTable,
  TeamMemberAiPolicyTable,
  TeamMemberTable,
  TeamTable,
  UserTable,
} from "../schema.pg";

export type TeamInviteRole = "member" | "viewer";

export const teamInvitationRepository = {
  async create(input: {
    teamId: string;
    inviterId: string;
    email: string;
    role: TeamInviteRole;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const email = normalizeInvitationEmail(input.email);
    return db.transaction(async (tx) => {
      const [team] = await tx
        .select({ ownerId: TeamTable.ownerId })
        .from(TeamTable)
        .where(eq(TeamTable.id, input.teamId))
        .for("update");
      if (!team) return { status: "not-found" as const };
      const [membership] = await tx
        .select({ role: TeamMemberTable.role })
        .from(TeamMemberTable)
        .where(
          and(
            eq(TeamMemberTable.teamId, input.teamId),
            eq(TeamMemberTable.userId, input.inviterId),
          ),
        )
        .for("update");
      if (team.ownerId !== input.inviterId && membership?.role !== "admin") {
        return { status: "forbidden" as const };
      }

      const now = new Date();
      // A team row lock serializes replacement of pending invitations for
      // this team, keeping the partial unique index race-safe.
      await tx
        .update(TeamInvitationTable)
        .set({ status: "expired" })
        .where(
          and(
            eq(TeamInvitationTable.teamId, input.teamId),
            eq(TeamInvitationTable.email, email),
            eq(TeamInvitationTable.status, "pending"),
            lt(TeamInvitationTable.expiresAt, now),
          ),
        );
      await tx
        .update(TeamInvitationTable)
        .set({ status: "revoked" })
        .where(
          and(
            eq(TeamInvitationTable.teamId, input.teamId),
            eq(TeamInvitationTable.email, email),
            eq(TeamInvitationTable.status, "pending"),
          ),
        );
      const [invitation] = await tx
        .insert(TeamInvitationTable)
        .values({
          teamId: input.teamId,
          inviterId: input.inviterId,
          email,
          role: input.role,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning({
          id: TeamInvitationTable.id,
          email: TeamInvitationTable.email,
          role: TeamInvitationTable.role,
          status: TeamInvitationTable.status,
          expiresAt: TeamInvitationTable.expiresAt,
          createdAt: TeamInvitationTable.createdAt,
        });
      return invitation
        ? { status: "created" as const, invitation }
        : { status: "failed" as const };
    });
  },

  async list(teamId: string) {
    return db
      .select({
        id: TeamInvitationTable.id,
        email: TeamInvitationTable.email,
        role: TeamInvitationTable.role,
        status: TeamInvitationTable.status,
        expiresAt: TeamInvitationTable.expiresAt,
        createdAt: TeamInvitationTable.createdAt,
      })
      .from(TeamInvitationTable)
      .where(
        and(
          eq(TeamInvitationTable.teamId, teamId),
          eq(TeamInvitationTable.status, "pending"),
          gt(TeamInvitationTable.expiresAt, new Date()),
        ),
      )
      .orderBy(sql`${TeamInvitationTable.createdAt} desc`)
      .limit(100);
  },

  async revoke(input: {
    teamId: string;
    invitationId: string;
    actorId: string;
  }) {
    return db.transaction(async (tx) => {
      const [team] = await tx
        .select({ ownerId: TeamTable.ownerId })
        .from(TeamTable)
        .where(eq(TeamTable.id, input.teamId))
        .for("update");
      if (!team) return { status: "not-found" as const };
      const [membership] = await tx
        .select({ role: TeamMemberTable.role })
        .from(TeamMemberTable)
        .where(
          and(
            eq(TeamMemberTable.teamId, input.teamId),
            eq(TeamMemberTable.userId, input.actorId),
          ),
        )
        .for("update");
      if (team.ownerId !== input.actorId && membership?.role !== "admin") {
        return { status: "forbidden" as const };
      }
      const [invitation] = await tx
        .update(TeamInvitationTable)
        .set({ status: "revoked" })
        .where(
          and(
            eq(TeamInvitationTable.id, input.invitationId),
            eq(TeamInvitationTable.teamId, input.teamId),
            eq(TeamInvitationTable.status, "pending"),
          ),
        )
        .returning({ id: TeamInvitationTable.id });
      return invitation
        ? { status: "revoked" as const }
        : { status: "not-pending" as const };
    });
  },

  async accept(input: { token: string; userId: string }) {
    const tokenHash = hashTeamInvitationToken(input.token);
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(TeamInvitationTable)
        .where(eq(TeamInvitationTable.tokenHash, tokenHash));
      if (!candidate) {
        return { status: "invalid" as const };
      }
      // Keep lock order consistent with create/revoke (team, then invite) to
      // avoid deadlocks when a manager rotates a link as it is accepted.
      const [team] = await tx
        .select({ ownerId: TeamTable.ownerId })
        .from(TeamTable)
        .where(eq(TeamTable.id, candidate.teamId))
        .for("update");
      if (!team) return { status: "invalid" as const };
      const [invitation] = await tx
        .select()
        .from(TeamInvitationTable)
        .where(
          and(
            eq(TeamInvitationTable.id, candidate.id),
            eq(TeamInvitationTable.tokenHash, tokenHash),
          ),
        )
        .for("update");
      if (!invitation) return { status: "invalid" as const };
      if (
        invitation.status === "accepted" &&
        invitation.acceptedByUserId === input.userId
      ) {
        return { status: "accepted" as const, teamId: invitation.teamId };
      }
      if (invitation.status !== "pending")
        return { status: "invalid" as const };
      const now = new Date();
      if (invitation.expiresAt <= now) {
        await tx
          .update(TeamInvitationTable)
          .set({ status: "expired" })
          .where(
            and(
              eq(TeamInvitationTable.id, invitation.id),
              eq(TeamInvitationTable.status, "pending"),
            ),
          );
        return { status: "invalid" as const };
      }
      const [user] = await tx
        .select({
          email: UserTable.email,
          emailVerified: UserTable.emailVerified,
          banned: UserTable.banned,
        })
        .from(UserTable)
        .where(eq(UserTable.id, input.userId));
      if (
        !user ||
        !user.emailVerified ||
        user.banned ||
        normalizeInvitationEmail(user.email) !== invitation.email
      ) {
        return { status: "invalid" as const };
      }
      const [existing] = await tx
        .select({ id: TeamMemberTable.id })
        .from(TeamMemberTable)
        .where(
          and(
            eq(TeamMemberTable.teamId, invitation.teamId),
            eq(TeamMemberTable.userId, input.userId),
          ),
        );
      if (existing || team.ownerId === input.userId) {
        return { status: "already-member" as const };
      }

      const [member] = await tx
        .insert(TeamMemberTable)
        .values({
          teamId: invitation.teamId,
          userId: input.userId,
          role: invitation.role,
        })
        .onConflictDoNothing({
          target: [TeamMemberTable.teamId, TeamMemberTable.userId],
        })
        .returning({ id: TeamMemberTable.id });
      if (!member) return { status: "already-member" as const };
      await tx.insert(TeamMemberAiPolicyTable).values({
        memberId: member.id,
        monthlyCapMicros: 15_000_000,
        currency: "EUR",
        hardStop: true,
      });
      const [accepted] = await tx
        .update(TeamInvitationTable)
        .set({
          status: "accepted",
          acceptedAt: now,
          acceptedByUserId: input.userId,
        })
        .where(
          and(
            eq(TeamInvitationTable.id, invitation.id),
            eq(TeamInvitationTable.status, "pending"),
            gt(TeamInvitationTable.expiresAt, now),
          ),
        )
        .returning({ id: TeamInvitationTable.id });
      if (!accepted) throw new Error("Invitation acceptance lost its lock");
      return { status: "accepted" as const, teamId: invitation.teamId };
    });
  },
};
