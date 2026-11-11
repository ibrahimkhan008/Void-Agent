import { eq } from "drizzle-orm";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import { pgDb } from "../db.pg";
import { N8nUserTable } from "../schema.pg";

const ENCRYPTED_SECRET_PREFIX = "enc:v1:";

function encodeSecret(secret?: string | null): string | null | undefined {
  if (secret == null || secret === "") return secret;
  if (!isEncryptionAvailable()) {
    throw new Error("ENCRYPTION_MASTER_KEY is required for N8N credentials");
  }
  return `${ENCRYPTED_SECRET_PREFIX}${encrypt(secret)}`;
}

function decodeSecret(secret?: string | null): string | null | undefined {
  if (secret == null || secret === "") return secret;
  if (!secret.startsWith(ENCRYPTED_SECRET_PREFIX)) return secret;
  return decrypt(secret.slice(ENCRYPTED_SECRET_PREFIX.length));
}

function isEncodedSecret(secret?: string | null): secret is string {
  return Boolean(secret?.startsWith(ENCRYPTED_SECRET_PREFIX));
}

export type N8nUserRecord = {
  id: string;
  userId: string;
  n8nUserId: string;
  apiKey: string;
  email?: string | null;
  password?: string | null;
};

export const pgN8nUserRepository = {
  async findByUserId(userId: string): Promise<N8nUserRecord | null> {
    const rows = await pgDb
      .select()
      .from(N8nUserTable)
      .where(eq(N8nUserTable.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    // Migrate legacy plaintext credentials on read, without requiring a
    // destructive schema change. Never return ciphertext to N8N clients.
    const password = decodeSecret(row.password);
    const apiKey = decodeSecret(row.apiKey);
    const legacyPassword = row.password && !isEncodedSecret(row.password);
    const legacyApiKey = row.apiKey && !isEncodedSecret(row.apiKey);
    if ((legacyPassword || legacyApiKey) && !isEncryptionAvailable()) {
      throw new Error(
        "ENCRYPTION_MASTER_KEY is required to migrate legacy N8N credentials",
      );
    }
    if ((legacyPassword || legacyApiKey) && isEncryptionAvailable()) {
      await pgDb
        .update(N8nUserTable)
        .set({
          ...(legacyPassword ? { password: encodeSecret(row.password)! } : {}),
          ...(legacyApiKey ? { apiKey: encodeSecret(row.apiKey)! } : {}),
        })
        .where(eq(N8nUserTable.id, row.id));
    }

    if (!apiKey) {
      throw new Error("N8N API key is missing from the credential record");
    }
    return { ...row, password, apiKey };
  },
  async save(record: {
    userId: string;
    n8nUserId: string;
    apiKey: string;
    email?: string;
    password?: string;
  }): Promise<N8nUserRecord> {
    const values = {
      ...record,
      password: encodeSecret(record.password),
      apiKey: encodeSecret(record.apiKey) ?? "",
    };
    const rows = await pgDb
      .insert(N8nUserTable)
      .values(values)
      .onConflictDoNothing({ target: N8nUserTable.userId })
      .returning();
    const row = rows[0];
    if (!row) {
      const existing = await this.findByUserId(record.userId);
      if (!existing) throw new Error("Could not persist N8N user credentials");
      return existing;
    }
    return {
      ...row,
      password: decodeSecret(row.password),
      apiKey: decodeSecret(row.apiKey) ?? "",
    };
  },
};
