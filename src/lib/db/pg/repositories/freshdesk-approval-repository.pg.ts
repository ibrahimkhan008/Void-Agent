import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type FreshdeskEffectApproval,
  hashFreshdeskApprovalToken,
  hashFreshdeskEffectApproval,
} from "lib/ai/tools/hitl/freshdesk-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "freshdesk-effect-approval";
const TTL = 10 * 60_000;

export const freshdeskApprovalRepository = {
  async issue(userId: string, payload: FreshdeskEffectApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashFreshdeskApprovalToken(token)}`,
      value: hashFreshdeskEffectApproval(payload), expiresAt: new Date(now.getTime() + TTL), createdAt: now, updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: FreshdeskEffectApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${PREFIX}:${userId}:${hashFreshdeskApprovalToken(token)}`),
      eq(VerificationTable.value, hashFreshdeskEffectApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
