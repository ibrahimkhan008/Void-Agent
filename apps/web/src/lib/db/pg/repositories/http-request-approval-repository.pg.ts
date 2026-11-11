import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type HttpRequestApproval,
  hashHttpRequestApproval,
  hashHttpRequestApprovalToken,
} from "lib/ai/tools/hitl/http-request-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "http-request-approval";
const TTL = 5 * 60_000;

export const httpRequestApprovalRepository = {
  async issue(userId: string, payload: HttpRequestApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db
      .delete(VerificationTable)
      .where(
        and(
          like(VerificationTable.identifier, `${PREFIX}:${userId}:%`),
          lt(VerificationTable.expiresAt, now),
        ),
      );
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashHttpRequestApprovalToken(token)}`,
      value: hashHttpRequestApproval(payload),
      expiresAt: new Date(now.getTime() + TTL),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: HttpRequestApproval) {
    const [consumed] = await db
      .delete(VerificationTable)
      .where(
        and(
          eq(
            VerificationTable.identifier,
            `${PREFIX}:${userId}:${hashHttpRequestApprovalToken(token)}`,
          ),
          eq(VerificationTable.value, hashHttpRequestApproval(payload)),
          gt(VerificationTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
