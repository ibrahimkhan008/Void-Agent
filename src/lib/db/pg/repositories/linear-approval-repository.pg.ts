import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  hashLinearIssueApproval,
  hashLinearIssueApprovalToken,
  type LinearIssueApproval,
} from "lib/ai/tools/hitl/linear-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const TOKEN_PREFIX = "linear-effect-approval";
const TOKEN_TTL_MS = 10 * 60_000;

export const linearApprovalRepository = {
  async issue(userId: string, payload: LinearIssueApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(
      like(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:%`),
      lt(VerificationTable.expiresAt, now),
    ));
    await db.insert(VerificationTable).values({
      identifier: `${TOKEN_PREFIX}:${userId}:${hashLinearIssueApprovalToken(token)}`,
      value: hashLinearIssueApproval(payload),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },

  async consume(userId: string, token: string, payload: LinearIssueApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:${hashLinearIssueApprovalToken(token)}`),
      eq(VerificationTable.value, hashLinearIssueApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
