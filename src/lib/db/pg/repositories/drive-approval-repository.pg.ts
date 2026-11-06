import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { type DriveFileApproval, hashDriveApprovalToken, hashDriveFileApproval } from "lib/ai/tools/hitl/drive-file-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "drive-file-approval";
const TTL = 10 * 60_000;

export const driveApprovalRepository = {
  async issue(userId: string, payload: DriveFileApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashDriveApprovalToken(token)}`, value: hashDriveFileApproval(payload),
      expiresAt: new Date(now.getTime() + TTL), createdAt: now, updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: DriveFileApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${PREFIX}:${userId}:${hashDriveApprovalToken(token)}`),
      eq(VerificationTable.value, hashDriveFileApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
