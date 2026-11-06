import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type EmailApprovalPayload,
  hashEmailApprovalPayload,
  hashEmailApprovalToken,
} from "lib/ai/tools/hitl/email-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const TOKEN_PREFIX = "email-effect-approval";
const TOKEN_TTL_MS = 10 * 60_000;

export const emailApprovalRepository = {
  async issue(userId: string, payload: EmailApprovalPayload) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const identifier = `${TOKEN_PREFIX}:${userId}:${hashEmailApprovalToken(token)}`;
    await db.delete(VerificationTable).where(and(
      like(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:%`),
      lt(VerificationTable.expiresAt, now),
    ));
    await db.insert(VerificationTable).values({
      identifier,
      value: hashEmailApprovalPayload(payload),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },

  async consume(userId: string, token: string, payload: EmailApprovalPayload) {
    const now = new Date();
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:${hashEmailApprovalToken(token)}`),
      eq(VerificationTable.value, hashEmailApprovalPayload(payload)),
      gt(VerificationTable.expiresAt, now),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
