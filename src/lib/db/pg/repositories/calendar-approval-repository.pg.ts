import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type CalendarApprovalPayload,
  hashCalendarApprovalPayload,
  hashCalendarApprovalToken,
} from "lib/ai/tools/hitl/calendar-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const TOKEN_PREFIX = "calendar-effect-approval";
const TOKEN_TTL_MS = 10 * 60_000;

export const calendarApprovalRepository = {
  async issue(userId: string, payload: CalendarApprovalPayload) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const identifier = `${TOKEN_PREFIX}:${userId}:${hashCalendarApprovalToken(token)}`;
    await db.delete(VerificationTable).where(and(
      like(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:%`),
      lt(VerificationTable.expiresAt, now),
    ));
    await db.insert(VerificationTable).values({
      identifier,
      value: hashCalendarApprovalPayload(payload),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },

  async consume(userId: string, token: string, payload: CalendarApprovalPayload) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:${hashCalendarApprovalToken(token)}`),
      eq(VerificationTable.value, hashCalendarApprovalPayload(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
