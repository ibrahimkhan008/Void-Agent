import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { VerificationTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const MAX_APPROVAL_BYTES = 16_000;
const TOKEN_TTL_MS = 10 * 60_000;
const ACCOUNT_REF_TTL_MS = 5 * 60_000;
const TOKEN_PREFIX = "composio-write-approval";
const ACCOUNT_REF_PREFIX = "void-composio-account-ref-v1";

function isBoundedJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > 8) return false;
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "string") {
      if (current.value.length > 8_000) return false;
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return false;
      continue;
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > 100) return false;
      for (const item of current.value) {
        pending.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }
    if (typeof current.value === "object") {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      const entries = Object.entries(current.value as Record<string, unknown>);
      if (entries.length > 100 || entries.some(([key]) => key.length > 160))
        return false;
      for (const [, child] of entries) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }
    return false;
  }
  return true;
}

export const composioWriteApprovalRequestSchema = z
  .object({
    // This is an authenticated, encrypted reference created by the server.
    // Raw Composio connected-account IDs are never accepted from model input.
    accountRef: z.string().min(40).max(2_048),
    accountLabel: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
    toolkitSlug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    actionSlug: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9_-]+$/),
    // Empty string represents a provider action without a version.
    actionVersion: z.string().max(64),
    schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    arguments: z.record(z.string().max(160), z.unknown()),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isBoundedJsonObject(value.arguments)) {
      ctx.addIssue({
        code: "custom",
        path: ["arguments"],
        message: "Arguments are not bounded JSON data",
      });
    } else if (
      Buffer.byteLength(canonicalJson(value.arguments), "utf8") >
      MAX_APPROVAL_BYTES
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["arguments"],
        message: "Arguments exceed the size limit",
      });
    }
  });

export type ComposioWriteApprovalRequest = z.infer<
  typeof composioWriteApprovalRequestSchema
>;

export type ComposioWriteApprovalPayload = Omit<
  ComposioWriteApprovalRequest,
  "accountRef"
> & {
  userId: string;
  connectedAccountId: string;
};

export function bindComposioWriteApprovalPayload(
  userId: string,
  connectedAccountId: string,
  request: ComposioWriteApprovalRequest,
): ComposioWriteApprovalPayload {
  const { accountRef: _accountRef, ...effect } = request;
  return { userId, connectedAccountId, ...effect };
}

type AccountReferencePayload = {
  userId: string;
  connectedAccountId: string;
  toolkitSlug: string;
  accountLabel: string;
  expiresAt: number;
};

export function getComposioAccountLabel(input: {
  id: string;
  alias?: unknown;
  toolkitSlug: string;
}) {
  const alias =
    typeof input.alias === "string"
      ? input.alias
          .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
          .replace(/\s+/gu, " ")
          .trim()
          .slice(0, 80)
          .trim()
      : "";
  if (alias) return alias;
  const toolkit =
    input.toolkitSlug
      .replace(/[^a-zA-Z0-9 _-]/gu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 60) || "Connected app";
  const suffix = input.id.replace(/[^a-zA-Z0-9]/gu, "").slice(-6) || "unknown";
  return `${toolkit} connection ·${suffix}`.slice(0, 120);
}

function getEncryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret)
    throw new Error(
      "BETTER_AUTH_SECRET is required for Composio account references",
    );
  return createHash("sha256")
    .update(`void-agent:composio-account-ref:${secret}`)
    .digest();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

/** Fingerprint the exact normalized action schema shown to the user. */
export function fingerprintComposioActionSchema(schema: unknown) {
  return createHash("sha256").update(canonicalJson(schema)).digest("hex");
}

export function hashComposioWriteApproval(
  payload: ComposioWriteApprovalPayload,
) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function hashComposioWriteApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a short-lived encrypted account reference safe to show in a tool proposal. */
export function createComposioAccountReference(
  input: Omit<AccountReferencePayload, "expiresAt">,
  now = Date.now(),
) {
  const payload: AccountReferencePayload = {
    ...input,
    expiresAt: now + ACCOUNT_REF_TTL_MS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ACCOUNT_REF_PREFIX}.${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function resolveComposioAccountReference(
  reference: string,
  expectedUserId: string,
  now = Date.now(),
): Omit<AccountReferencePayload, "expiresAt"> | null {
  try {
    const [prefix, encoded, extra] = reference.split(".");
    if (prefix !== ACCOUNT_REF_PREFIX || !encoded || extra) return null;
    const data = Buffer.from(encoded, "base64url");
    if (data.length < 29 || data.length > 2_048) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const value = JSON.parse(plaintext) as Partial<AccountReferencePayload>;
    if (
      typeof value.userId !== "string" ||
      value.userId !== expectedUserId ||
      typeof value.connectedAccountId !== "string" ||
      !value.connectedAccountId ||
      typeof value.toolkitSlug !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(value.toolkitSlug) ||
      typeof value.accountLabel !== "string" ||
      value.accountLabel.length < 1 ||
      value.accountLabel.length > 120 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value.accountLabel) ||
      typeof value.expiresAt !== "number" ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + ACCOUNT_REF_TTL_MS
    )
      return null;
    return {
      userId: value.userId,
      connectedAccountId: value.connectedAccountId,
      toolkitSlug: value.toolkitSlug,
      accountLabel: value.accountLabel,
    };
  } catch {
    return null;
  }
}

export interface ComposioWriteApprovalPersistence {
  deleteExpired(identifierPrefix: string, now: Date): Promise<void>;
  insert(input: {
    identifier: string;
    value: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  consume(input: {
    identifier: string;
    value: string;
    now: Date;
  }): Promise<boolean>;
}

export function createComposioWriteApprovalRepository(
  persistence: ComposioWriteApprovalPersistence,
  now: () => Date = () => new Date(),
) {
  return {
    async issue(userId: string, payload: ComposioWriteApprovalPayload) {
      if (!userId || payload.userId !== userId) {
        throw new Error(
          "Composio approval owner does not match the authenticated user",
        );
      }
      const token = randomBytes(32).toString("base64url");
      const issuedAt = now();
      const identifierPrefix = `${TOKEN_PREFIX}:${hashUserId(userId)}:`;
      await persistence.deleteExpired(identifierPrefix, issuedAt);
      await persistence.insert({
        identifier: `${identifierPrefix}${hashComposioWriteApprovalToken(token)}`,
        value: hashComposioWriteApproval(payload),
        expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS),
        now: issuedAt,
      });
      return token;
    },
    async consume(
      userId: string,
      token: string,
      payload: ComposioWriteApprovalPayload,
    ) {
      if (!userId || payload.userId !== userId || !token || token.length > 128)
        return false;
      const current = now();
      return persistence.consume({
        identifier: `${TOKEN_PREFIX}:${hashUserId(userId)}:${hashComposioWriteApprovalToken(token)}`,
        value: hashComposioWriteApproval(payload),
        now: current,
      });
    },
  };
}

function hashUserId(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}

const pgPersistence: ComposioWriteApprovalPersistence = {
  async deleteExpired(identifierPrefix, now) {
    await db
      .delete(VerificationTable)
      .where(
        and(
          like(VerificationTable.identifier, `${identifierPrefix}%`),
          lt(VerificationTable.expiresAt, now),
        ),
      );
  },
  async insert({ identifier, value, expiresAt, now }) {
    await db.insert(VerificationTable).values({
      identifier,
      value,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  },
  async consume({ identifier, value, now }) {
    const [deleted] = await db
      .delete(VerificationTable)
      .where(
        and(
          eq(VerificationTable.identifier, identifier),
          eq(VerificationTable.value, value),
          gt(VerificationTable.expiresAt, now),
        ),
      )
      .returning({ id: VerificationTable.id });
    return Boolean(deleted);
  },
};

export const composioWriteApprovalRepository =
  createComposioWriteApprovalRepository(pgPersistence);
