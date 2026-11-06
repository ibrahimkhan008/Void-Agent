import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { type WorkflowRunApproval, hashWorkflowApprovalToken, hashWorkflowRunApproval } from "lib/ai/tools/hitl/workflow-run-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "workflow-run-approval";
const TTL = 10 * 60_000;

export const workflowRunApprovalRepository = {
  async issue(userId: string, payload: WorkflowRunApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashWorkflowApprovalToken(token)}`,
      value: hashWorkflowRunApproval(payload),
      expiresAt: new Date(now.getTime() + TTL),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: WorkflowRunApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${PREFIX}:${userId}:${hashWorkflowApprovalToken(token)}`),
      eq(VerificationTable.value, hashWorkflowRunApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
