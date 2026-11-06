import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { type McpToolApproval, hashMcpToolApproval, hashMcpToolApprovalToken } from "lib/ai/tools/hitl/mcp-tool-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "mcp-tool-approval";
const TTL = 10 * 60_000;

export const mcpToolApprovalRepository = {
  async issue(userId: string, payload: McpToolApproval) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(VerificationTable).where(and(like(VerificationTable.identifier, `${PREFIX}:${userId}:%`), lt(VerificationTable.expiresAt, now)));
    await db.insert(VerificationTable).values({
      identifier: `${PREFIX}:${userId}:${hashMcpToolApprovalToken(token)}`,
      value: hashMcpToolApproval(payload),
      expiresAt: new Date(now.getTime() + TTL), createdAt: now, updatedAt: now,
    });
    return token;
  },
  async consume(userId: string, token: string, payload: McpToolApproval) {
    const [consumed] = await db.delete(VerificationTable).where(and(
      eq(VerificationTable.identifier, `${PREFIX}:${userId}:${hashMcpToolApprovalToken(token)}`),
      eq(VerificationTable.value, hashMcpToolApproval(payload)),
      gt(VerificationTable.expiresAt, new Date()),
    )).returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
