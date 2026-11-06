import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  TeamMemberAiPolicyTable,
  TeamMemberAiReservationTable,
  TeamMemberAiUsagePeriodTable,
  TeamMemberTable,
  TeamTable,
} from "lib/db/pg/schema.pg";
import {
  TeamBudgetExceededError,
  type TeamBudgetPolicy,
  TeamBudgetPolicyError,
  checkBudgetReservation,
  getCurrentBudgetPeriod,
  resolveMemberBudgetPolicy,
  settleBudgetCounters,
} from "./team-member-ai-budget-core";

export {
  TeamBudgetAuthorizationError,
  TeamBudgetExceededError,
  TeamBudgetPolicyError,
} from "./team-member-ai-budget-core";

const RESERVATION_TTL_MS = 15 * 60 * 1000;

const readPolicy = async (
  executor: typeof pgDb | Parameters<Parameters<typeof pgDb.transaction>[0]>[0],
  teamId: string,
  userId: string,
): Promise<TeamBudgetPolicy | null> => {
  const [row] = await executor
    .select({
      memberId: TeamMemberTable.id,
      userId: TeamMemberTable.userId,
      teamId: TeamMemberTable.teamId,
      role: TeamMemberTable.role,
      teamOwnerId: TeamTable.ownerId,
      monthlyCapMicros: TeamMemberAiPolicyTable.monthlyCapMicros,
      currency: TeamMemberAiPolicyTable.currency,
      hardStop: TeamMemberAiPolicyTable.hardStop,
    })
    .from(TeamMemberTable)
    .innerJoin(TeamTable, eq(TeamTable.id, TeamMemberTable.teamId))
    .leftJoin(
      TeamMemberAiPolicyTable,
      eq(TeamMemberAiPolicyTable.memberId, TeamMemberTable.id),
    )
    .where(
      and(
        eq(TeamMemberTable.teamId, teamId),
        eq(TeamMemberTable.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (
    row.role !== "owner" &&
    row.teamOwnerId !== userId &&
    row.hardStop === null
  ) {
    throw new TeamBudgetPolicyError();
  }
  return row as TeamBudgetPolicy;
};

export const getTeamMemberBudgetPolicy = async (
  teamId: string,
  userId: string,
) =>
  resolveMemberBudgetPolicy({
    policy: await readPolicy(pgDb, teamId, userId),
    teamId,
    userId,
  });

const acquireMemberLock = (executor: any, memberId: string) =>
  executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`);

export const reserveTeamMemberBudget = async (input: {
  teamId: string;
  userId: string;
  modelKey: string;
  currency: string;
  estimateMicros: number;
  idempotencyKey: string;
  now?: Date;
}) => {
  if (
    !Number.isSafeInteger(input.estimateMicros) ||
    input.estimateMicros < 0 ||
    !input.modelKey ||
    !input.idempotencyKey
  ) {
    throw new TeamBudgetPolicyError("Invalid team AI budget reservation.");
  }
  const preview = await getTeamMemberBudgetPolicy(input.teamId, input.userId);
  if (!preview) return undefined;

  const transactionResult = await pgDb.transaction(async (tx) => {
    await acquireMemberLock(tx, preview.memberId);
    const policy = resolveMemberBudgetPolicy({
      policy: await readPolicy(tx, input.teamId, input.userId),
      teamId: input.teamId,
      userId: input.userId,
    });
    if (!policy) return { reservation: undefined };

    const now = input.now ?? new Date();
    const { start, end } = getCurrentBudgetPeriod(now);
    await tx
      .insert(TeamMemberAiUsagePeriodTable)
      .values({ memberId: policy.memberId, periodStart: start, periodEnd: end })
      .onConflictDoNothing();
    const [period] = await tx
      .select()
      .from(TeamMemberAiUsagePeriodTable)
      .where(
        and(
          eq(TeamMemberAiUsagePeriodTable.memberId, policy.memberId),
          eq(TeamMemberAiUsagePeriodTable.periodStart, start),
        ),
      )
      .limit(1);
    if (!period) throw new TeamBudgetPolicyError();

    const [existing] = await tx
      .select()
      .from(TeamMemberAiReservationTable)
      .where(
        eq(TeamMemberAiReservationTable.idempotencyKey, input.idempotencyKey),
      )
      .limit(1);
    if (existing) {
      if (
        existing.usagePeriodId !== period.id ||
        existing.userId !== input.userId
      ) {
        throw new TeamBudgetPolicyError("Budget reservation key collision.");
      }
      return { reservation: existing };
    }

    const expired = await tx
      .select({
        id: TeamMemberAiReservationTable.id,
        estimateMicros: TeamMemberAiReservationTable.estimateMicros,
      })
      .from(TeamMemberAiReservationTable)
      .where(
        and(
          eq(TeamMemberAiReservationTable.usagePeriodId, period.id),
          eq(TeamMemberAiReservationTable.status, "reserved"),
          lt(TeamMemberAiReservationTable.expiresAt, now),
        ),
      );
    if (expired.length) {
      const expiredMicros = expired.reduce(
        (sum, item) => sum + item.estimateMicros,
        0,
      );
      await tx
        .update(TeamMemberAiReservationTable)
        .set({ status: "expired", finalizedAt: now })
        .where(
          and(
            eq(TeamMemberAiReservationTable.usagePeriodId, period.id),
            eq(TeamMemberAiReservationTable.status, "reserved"),
            lt(TeamMemberAiReservationTable.expiresAt, now),
          ),
        );
      period.reservedMicros = Math.max(
        0,
        period.reservedMicros - expiredMicros,
      );
    }

    if (policy.currency !== input.currency) {
      throw new TeamBudgetPolicyError(
        "Team budget and model pricing currencies differ.",
      );
    }
    const capacity = checkBudgetReservation({
      finalizedMicros: period.finalizedMicros,
      reservedMicros: period.reservedMicros,
      capMicros: policy.monthlyCapMicros!,
      estimateMicros: input.estimateMicros,
    });
    if (!capacity.allowed) return { exceeded: true as const };

    await tx
      .update(TeamMemberAiUsagePeriodTable)
      .set({ reservedMicros: capacity.nextReservedMicros, updatedAt: now })
      .where(eq(TeamMemberAiUsagePeriodTable.id, period.id));
    const [reservation] = await tx
      .insert(TeamMemberAiReservationTable)
      .values({
        usagePeriodId: period.id,
        teamId: input.teamId,
        userId: input.userId,
        modelKey: input.modelKey,
        idempotencyKey: input.idempotencyKey,
        estimateMicros: input.estimateMicros,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      })
      .returning();
    return { reservation };
  });
  if ("exceeded" in transactionResult && transactionResult.exceeded) {
    throw new TeamBudgetExceededError();
  }
  return transactionResult.reservation;
};

const settleReservation = async (input: {
  reservationId?: string;
  actualMicros?: number;
  status: "finalized" | "released";
}) => {
  if (!input.reservationId) return;
  if (
    input.status === "finalized" &&
    (!Number.isSafeInteger(input.actualMicros) || input.actualMicros! < 0)
  ) {
    throw new TeamBudgetPolicyError("Invalid actual AI usage cost.");
  }
  const [lookup] = await pgDb
    .select({
      memberId: TeamMemberAiUsagePeriodTable.memberId,
      periodId: TeamMemberAiReservationTable.usagePeriodId,
    })
    .from(TeamMemberAiReservationTable)
    .innerJoin(
      TeamMemberAiUsagePeriodTable,
      eq(
        TeamMemberAiUsagePeriodTable.id,
        TeamMemberAiReservationTable.usagePeriodId,
      ),
    )
    .where(eq(TeamMemberAiReservationTable.id, input.reservationId))
    .limit(1);
  if (!lookup) return;

  await pgDb.transaction(async (tx) => {
    await acquireMemberLock(tx, lookup.memberId);
    const [reservation] = await tx
      .select()
      .from(TeamMemberAiReservationTable)
      .where(eq(TeamMemberAiReservationTable.id, input.reservationId!))
      .limit(1);
    if (!reservation || reservation.status !== "reserved") return;
    const [period] = await tx
      .select()
      .from(TeamMemberAiUsagePeriodTable)
      .where(eq(TeamMemberAiUsagePeriodTable.id, reservation.usagePeriodId))
      .limit(1);
    if (!period) throw new TeamBudgetPolicyError("Budget period is missing.");

    const now = new Date();
    const counters = settleBudgetCounters({
      finalizedMicros: period.finalizedMicros,
      reservedMicros: period.reservedMicros,
      estimateMicros: reservation.estimateMicros,
      actualMicros: input.status === "finalized" ? input.actualMicros : 0,
    });
    await tx
      .update(TeamMemberAiUsagePeriodTable)
      .set({
        reservedMicros: counters.reservedMicros,
        finalizedMicros: counters.finalizedMicros,
        updatedAt: now,
      })
      .where(eq(TeamMemberAiUsagePeriodTable.id, period.id));
    await tx
      .update(TeamMemberAiReservationTable)
      .set({
        ...(input.status === "finalized"
          ? { actualMicros: input.actualMicros }
          : {}),
        status: input.status,
        finalizedAt: now,
      })
      .where(eq(TeamMemberAiReservationTable.id, reservation.id));
  });
};

export const finalizeTeamMemberBudget = (input: {
  reservationId?: string;
  actualMicros: number;
}) => settleReservation({ ...input, status: "finalized" });

export const releaseTeamMemberBudget = (reservationId?: string) =>
  settleReservation({ reservationId, status: "released" });
