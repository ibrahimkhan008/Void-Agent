import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import {
  type ConnectorActionApproval,
  hashConnectorActionApproval,
  hashConnectorActionApprovalToken,
} from "lib/ai/tools/hitl/connector-action-approval";
import { pgDb } from "../db.pg";
import { VerificationTable } from "../schema.pg";

const PREFIX = "connector-action-approval-v1";
const TTL_MS = 5 * 60_000;

export const connectorActionApprovalRepository = {
  async issue(
    userId: string,
    payload: ConnectorActionApproval,
    now = new Date(),
  ) {
    const token = randomBytes(32).toString("base64url");
    const identifierPrefix = `${PREFIX}:${userId}:`;
    await pgDb
      .delete(VerificationTable)
      .where(
        and(
          like(VerificationTable.identifier, `${identifierPrefix}%`),
          lt(VerificationTable.expiresAt, now),
        ),
      );
    await pgDb.insert(VerificationTable).values({
      identifier: `${identifierPrefix}${hashConnectorActionApprovalToken(token)}`,
      value: hashConnectorActionApproval(payload),
      expiresAt: new Date(now.getTime() + TTL_MS),
      createdAt: now,
      updatedAt: now,
    });
    return token;
  },

  async consume(
    userId: string,
    token: string,
    payload: ConnectorActionApproval,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const [consumed] = await pgDb
      .delete(VerificationTable)
      .where(
        and(
          eq(
            VerificationTable.identifier,
            `${PREFIX}:${userId}:${hashConnectorActionApprovalToken(token)}`,
          ),
          eq(VerificationTable.value, hashConnectorActionApproval(payload)),
          gt(VerificationTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: VerificationTable.id });
    return Boolean(consumed);
  },
};
