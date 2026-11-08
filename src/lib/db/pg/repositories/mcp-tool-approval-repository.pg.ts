import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type McpToolApprovalRequest,
  hashMcpToolApproval,
  hashMcpToolApprovalToken,
} from "lib/ai/tools/hitl/mcp-tool-approval";
import { pgDb as db } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "mcp-tool-approval";
const TTL = 10 * 60_000;

export const mcpToolApprovalRepository = {
  async issue(
    userId: string,
    payload: McpToolApprovalRequest,
    serverConfigFingerprint: string,
  ) {
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
      identifier: `${PREFIX}:${userId}:${hashMcpToolApprovalToken(token)}`,
      // The fingerprint is a non-reversible digest of the full server config;
      // storing it beside the argument hash binds the one-use token to its target.
      value: `${hashMcpToolApproval(payload)}:${serverConfigFingerprint}`,
      expiresAt: new Date(now.getTime() + TTL),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },
  async consume(
    userId: string,
    token: string,
    payload: McpToolApprovalRequest,
    serverConfigFingerprint: string,
  ) {
    const [consumed] = await db
      .delete(VerificationTable)
      .where(
        and(
          eq(
            VerificationTable.identifier,
            `${PREFIX}:${userId}:${hashMcpToolApprovalToken(token)}`,
          ),
          eq(
            VerificationTable.value,
            `${hashMcpToolApproval(payload)}:${serverConfigFingerprint}`,
          ),
          gt(VerificationTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
