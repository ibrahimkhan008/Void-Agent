import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { type TaskCreationApproval, hashTaskApprovalToken, hashTaskCreationApproval } from "lib/ai/tools/hitl/task-creation-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "task-creation-approval";
const TTL = 10 * 60_000;

export const taskCreationApprovalRepository = {
  async issue(userId: string, payload: TaskCreationApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashTaskApprovalToken(token)}`, value: hashTaskCreationApproval(payload),
      expiresAt: new Date(now.getTime() + TTL), createdAt: now, updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: TaskCreationApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${PREFIX}:${userId}:${hashTaskApprovalToken(token)}`),
      eq(VerificationTable.value, hashTaskCreationApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
