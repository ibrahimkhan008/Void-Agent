import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, lt, like } from "drizzle-orm";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import { pgDb } from "lib/db/pg/db.pg";
import { VerificationTable } from "lib/db/pg/schema.pg";
import type { ConnectorProvider } from "./providers-list";

const PREFIX = "connector-oauth-v1";
const STATE_TTL_MS = 10 * 60_000;

export type ConnectorOAuthState = {
  userId: string;
  provider: ConnectorProvider;
  redirectUri: string;
  verifier?: string;
};

const stateHash = (state: string) =>
  createHash("sha256").update(state).digest("hex");

function stateSignature(nonce: string): Buffer {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key || key.length !== 32)
    throw new Error("Connector encryption is not configured");
  const derivedKey = createHmac("sha256", key)
    .update("connector-oauth-state-v1")
    .digest();
  return createHmac("sha256", derivedKey).update(nonce).digest();
}

function verifySignedState(state: string): boolean {
  const parts = state.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    return false;
  try {
    const expected = stateSignature(parts[0]);
    const actual = Buffer.from(parts[1], "base64url");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export async function issueConnectorOAuthState(
  data: ConnectorOAuthState,
  now = new Date(),
) {
  if (!isEncryptionAvailable()) {
    throw new Error("Connector token encryption is not configured");
  }
  const nonce = randomBytes(32).toString("base64url");
  const state = `${nonce}.${stateSignature(nonce).toString("base64url")}`;
  const identifier = `${PREFIX}:${stateHash(state)}`;
  const value = encrypt(JSON.stringify(data));

  await pgDb
    .delete(VerificationTable)
    .where(
      and(
        like(VerificationTable.identifier, `${PREFIX}:%`),
        lt(VerificationTable.expiresAt, now),
      ),
    );
  await pgDb.insert(VerificationTable).values({
    identifier,
    value,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });
  return state;
}

/** Atomically consumes state before validating its contents. Replays fail. */
export async function consumeConnectorOAuthState(
  state: string,
  now = new Date(),
): Promise<ConnectorOAuthState | null> {
  if (
    !isEncryptionAvailable() ||
    state.length > 96 ||
    !verifySignedState(state)
  ) {
    return null;
  }
  const [row] = await pgDb
    .delete(VerificationTable)
    .where(
      and(
        eq(VerificationTable.identifier, `${PREFIX}:${stateHash(state)}`),
        gt(VerificationTable.expiresAt, now),
      ),
    )
    .returning({ value: VerificationTable.value });
  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(
      decrypt(row.value),
    ) as Partial<ConnectorOAuthState>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.provider !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      (parsed.verifier !== undefined && typeof parsed.verifier !== "string")
    ) {
      return null;
    }
    return parsed as ConnectorOAuthState;
  } catch {
    return null;
  }
}
