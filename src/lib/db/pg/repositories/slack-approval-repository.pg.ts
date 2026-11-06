import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { type SlackMessageApproval, hashSlackApprovalToken, hashSlackMessageApproval } from "lib/ai/tools/hitl/slack-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const TOKEN_PREFIX = "slack-message-approval";
const TOKEN_TTL_MS = 10 * 60_000;

export const slackApprovalRepository = {
  async issue(userId: string, payload: SlackMessageApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${TOKEN_PREFIX}:${userId}:${hashSlackApprovalToken(token)}`,
      value: hashSlackMessageApproval(payload), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS), createdAt: now, updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: SlackMessageApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${TOKEN_PREFIX}:${userId}:${hashSlackApprovalToken(token)}`),
      eq(VerificationTable.value, hashSlackMessageApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
