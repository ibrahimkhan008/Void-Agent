import "server-only";

import { createHash, createSign } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { serverCache } from "lib/cache";
import { getBaseUrl } from "lib/const";
import { pgDb } from "lib/db/pg/db.pg";
import { CockpitConnectionTable } from "lib/db/pg/schema.pg";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import { z } from "zod";
import type { StripeConnectionScope } from "./stripe";

const PROD_API = "https://b2b.revolut.com/api/1.0";
const SANDBOX_API = "https://sandbox-b2b.revolut.com/api/1.0";
const REVOLUT_AUDIENCE = "https://revolut.com";
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ACCOUNTS = 1_000;
const MAX_TRANSACTIONS = 1_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const revolutAuthSchema = z
  .object({
    clientId: z.string().trim().min(1).max(200),
    privateKeyPem: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .refine((value) => value.includes("PRIVATE KEY")),
    sandbox: z.boolean(),
    issuer: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .strict();

export const revolutConfigSchema = z
  .object({
    clientId: z.string().trim().min(1).max(200),
    privateKeyPem: z
      .string()
      .min(1)
      .max(10_000)
      .refine((value) => value.includes("PRIVATE KEY")),
    refreshToken: z.string().trim().min(1).max(10_000),
    sandbox: z.boolean().default(false),
    issuer: z.string().trim().max(200).optional().or(z.literal("")),
    largeTransactionThreshold: z.number().finite().min(0).max(1_000_000),
  })
  .strict();

/** authorizationCode is transient and is never persisted in the config. */
export const revolutSubmitSchema = z
  .object({
    clientId: optionalText(200),
    privateKeyPem: optionalText(10_000),
    authorizationCode: optionalText(2_000),
    sandbox: z.boolean(),
    issuer: optionalText(200),
    largeTransactionThreshold: z.number().finite().min(0).max(1_000_000),
  })
  .strict();

export type RevolutConfig = z.infer<typeof revolutConfigSchema>;
export type RevolutConfigInput = z.infer<typeof revolutSubmitSchema>;

export type RevolutSummary = {
  balances: Array<{ currency: string; amount: number }>;
  flows30d: Array<{ currency: string; inflow: number; outflow: number }>;
  recent: Array<{
    id: string;
    createdAt: string;
    type: string;
    state: string;
    description: string;
    amount: number;
    currency: string;
  }>;
  largeTransactionThreshold: number;
  generatedAt: string;
};

export class RevolutProviderError extends Error {
  constructor(
    readonly code:
      | "unauthorized"
      | "unavailable"
      | "invalid_response"
      | "reauthorize",
  ) {
    super(code);
    this.name = "RevolutProviderError";
  }
}

const issuerFor = (issuer?: string) => {
  const supplied = issuer?.trim();
  if (supplied) {
    if (
      supplied.length > 200 ||
      supplied.includes("://") ||
      supplied.includes("/") ||
      supplied.includes("@") ||
      supplied.startsWith(".") ||
      supplied.endsWith(".") ||
      !/^(?=.{1,200}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(supplied)
    )
      throw new RevolutProviderError("invalid_response");
    return supplied;
  }
  const baseUrl = getBaseUrl();
  try {
    return new URL(baseUrl).hostname;
  } catch {
    throw new RevolutProviderError("unavailable");
  }
};

const base64Url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

/** Create the signed client assertion used by Revolut Business OAuth. */
export function createRevolutClientAssertion(
  config: Pick<RevolutConfig, "clientId" | "privateKeyPem" | "issuer">,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: issuerFor(config.issuer),
      sub: config.clientId,
      aud: REVOLUT_AUDIENCE,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(config.privateKeyPem).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

type RevolutTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

function apiBase(sandbox: boolean) {
  return sandbox ? SANDBOX_API : PROD_API;
}

async function readJsonBounded<T>(response: Response): Promise<T> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new RevolutProviderError("invalid_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RevolutProviderError("invalid_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    if (error instanceof RevolutProviderError) throw error;
    throw new RevolutProviderError("invalid_response");
  } finally {
    reader.releaseLock();
  }
}

async function tokenRequest(
  config: Pick<
    RevolutConfig,
    "clientId" | "privateKeyPem" | "issuer" | "sandbox"
  >,
  grant: Record<string, string>,
  signal: AbortSignal,
): Promise<RevolutTokenResponse> {
  const url = new URL(`${apiBase(config.sandbox)}/auth/token`);
  const form = new URLSearchParams({
    ...grant,
    client_id: config.clientId,
    client_assertion_type: ASSERTION_TYPE,
    client_assertion: createRevolutClientAssertion(config),
  });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new RevolutProviderError("unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 400 || response.status === 401)
      throw new RevolutProviderError("reauthorize");
    throw new RevolutProviderError("unavailable");
  }
  const raw = await readJsonBounded<unknown>(response);
  const parsed = z
    .object({
      access_token: z.string().min(1).max(10_000),
      expires_in: z.number().finite().positive().optional(),
      refresh_token: z.string().min(1).max(10_000).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) throw new RevolutProviderError("invalid_response");
  return parsed.data;
}

function tokenCacheKey(config: RevolutConfig) {
  const digest = createHash("sha256")
    .update(
      `${config.clientId}:${config.refreshToken}:${config.sandbox}:${config.issuer ?? ""}`,
    )
    .digest("hex")
    .slice(0, 32);
  return `cockpit:revolut:token:${digest}`;
}

const pendingAccessTokens = new Map<string, Promise<string>>();

async function accessToken(config: RevolutConfig, signal: AbortSignal) {
  const key = tokenCacheKey(config);
  const cached = await serverCache.get<string>(key).catch(() => undefined);
  if (cached) return cached;
  const pending = pendingAccessTokens.get(key);
  if (pending) return pending;
  const request = (async () => {
    const token = await tokenRequest(
      config,
      { grant_type: "refresh_token", refresh_token: config.refreshToken },
      signal,
    );
    const ttl = Math.max(60, Math.min(token.expires_in ?? 2400, 2400) - 120);
    await serverCache
      .set(key, token.access_token, ttl * 1000)
      .catch(() => undefined);
    return token.access_token;
  })();
  pendingAccessTokens.set(key, request);
  try {
    return await request;
  } finally {
    if (pendingAccessTokens.get(key) === request)
      pendingAccessTokens.delete(key);
  }
}

async function revolutGet<T>(
  path: string,
  config: RevolutConfig,
  signal: AbortSignal,
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes(".."))
    throw new RevolutProviderError("unavailable");
  const base = new URL(apiBase(config.sandbox));
  const url = new URL(`${base.origin}${base.pathname}${path}`);
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(`${base.pathname}/`)
  )
    throw new RevolutProviderError("unavailable");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${await accessToken(config, signal)}` },
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof RevolutProviderError) throw error;
    throw new RevolutProviderError("unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401 || response.status === 403)
      throw new RevolutProviderError("unauthorized");
    throw new RevolutProviderError("unavailable");
  }
  return readJsonBounded<T>(response);
}

type Account = { id: string; balance: number; currency: string; state: string };
type Transaction = {
  id: string;
  type: string;
  state: string;
  created_at: string;
  reference?: string;
  legs: Array<{
    amount: number;
    currency: string;
    description?: string;
    account_id?: string;
  }>;
};

const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/i)
  .transform((v) => v.toUpperCase());
const accountSchema = z
  .object({
    id: z.string().min(1).max(200),
    balance: z.number().finite(),
    currency: currencySchema,
    state: z.string().min(1).max(40),
  })
  .passthrough();
const transactionSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(80),
    state: z.string().min(1).max(80),
    created_at: z.string().datetime({ offset: true }),
    completed_at: z.string().datetime({ offset: true }).optional(),
    reference: z.string().max(500).optional(),
    legs: z
      .array(
        z
          .object({
            amount: z.number().finite(),
            currency: currencySchema,
            description: z.string().max(1_000).optional(),
            account_id: z.string().max(200).optional(),
          })
          .passthrough(),
      )
      .max(20),
  })
  .passthrough();

export function summarizeRevolut(input: {
  accounts: Account[];
  transactions: Transaction[];
  threshold: number;
  now?: Date;
}): RevolutSummary {
  const balances = new Map<string, number>();
  for (const account of input.accounts) {
    if (account.state !== "active") continue;
    balances.set(
      account.currency,
      (balances.get(account.currency) ?? 0) + account.balance,
    );
  }
  const ownAccounts = new Set(input.accounts.map((account) => account.id));
  const flows = new Map<string, { inflow: number; outflow: number }>();
  const completed = input.transactions.filter(
    (transaction) =>
      transaction.state === "completed" && transaction.type !== "exchange",
  );
  for (const transaction of completed) {
    const internal =
      transaction.legs.length > 1 &&
      transaction.legs.every(
        (leg) => leg.account_id && ownAccounts.has(leg.account_id),
      );
    if (internal) continue;
    for (const leg of transaction.legs) {
      const current = flows.get(leg.currency) ?? { inflow: 0, outflow: 0 };
      if (leg.amount >= 0) current.inflow += leg.amount;
      else current.outflow += -leg.amount;
      flows.set(leg.currency, current);
    }
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const recent = [...input.transactions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((transaction) => {
      const leg = transaction.legs[0];
      return {
        id: transaction.id,
        createdAt: transaction.created_at,
        type: transaction.type.slice(0, 80),
        state: transaction.state.slice(0, 80),
        description: (
          leg?.description ??
          transaction.reference ??
          transaction.type
        ).slice(0, 120),
        amount: leg?.amount ?? 0,
        currency: leg?.currency ?? "",
      };
    });
  return {
    balances: [...balances.entries()]
      .map(([currency, amount]) => ({ currency, amount: round(amount) }))
      .sort((a, b) => b.amount - a.amount),
    flows30d: [...flows.entries()].map(([currency, flow]) => ({
      currency,
      inflow: round(flow.inflow),
      outflow: round(flow.outflow),
    })),
    recent,
    largeTransactionThreshold: input.threshold,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** OAuth-code exchange and current-access check are both fixed-host operations. */
export async function prepareRevolutConnection(
  config: Pick<
    RevolutConfig,
    "clientId" | "privateKeyPem" | "issuer" | "sandbox"
  >,
  authorizationCode: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await tokenRequest(
      config,
      { grant_type: "authorization_code", code: authorizationCode },
      controller.signal,
    );
    if (!token.refresh_token)
      throw new RevolutProviderError("invalid_response");
    return token.refresh_token;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRevolut(configInput: unknown): Promise<boolean> {
  try {
    const parsed = revolutConfigSchema.safeParse(configInput);
    if (!parsed.success) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const accounts = await revolutGet<unknown>(
        "/accounts",
        parsed.data,
        controller.signal,
      );
      return Array.isArray(accounts) && accounts.length <= MAX_ACCOUNTS;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function fetchRevolutSummary(
  configInput: unknown,
  options: { now?: Date } = {},
): Promise<RevolutSummary> {
  const parsed = revolutConfigSchema.safeParse(configInput);
  if (!parsed.success) throw new RevolutProviderError("invalid_response");
  const config = parsed.data;
  const now = options.now ?? new Date();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const from = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const to = now.toISOString();
    const [rawAccounts, rawTransactions] = await Promise.all([
      revolutGet<unknown>("/accounts", config, controller.signal),
      revolutGet<unknown>(
        `/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&count=${MAX_TRANSACTIONS}`,
        config,
        controller.signal,
      ),
    ]);
    if (
      !Array.isArray(rawAccounts) ||
      rawAccounts.length > MAX_ACCOUNTS ||
      !Array.isArray(rawTransactions) ||
      rawTransactions.length > MAX_TRANSACTIONS
    )
      throw new RevolutProviderError("invalid_response");
    const accounts = z.array(accountSchema).safeParse(rawAccounts);
    const transactions = z.array(transactionSchema).safeParse(rawTransactions);
    if (!accounts.success || !transactions.success)
      throw new RevolutProviderError("invalid_response");
    return summarizeRevolut({
      accounts: accounts.data,
      transactions: transactions.data,
      threshold: config.largeTransactionThreshold,
      now,
    });
  } finally {
    clearTimeout(timer);
  }
}

const connectionWhere = (scope: StripeConnectionScope) =>
  and(
    eq(CockpitConnectionTable.provider, "revolut"),
    scope.teamId
      ? eq(CockpitConnectionTable.teamId, scope.teamId)
      : and(
          eq(CockpitConnectionTable.userId, scope.userId),
          isNull(CockpitConnectionTable.teamId),
        ),
  );

function decryptConfig(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(decrypt(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function getRevolutConnectionStatus(scope: StripeConnectionScope) {
  const [row] = await pgDb
    .select({
      configEncrypted: CockpitConnectionTable.configEncrypted,
      lastTestedAt: CockpitConnectionTable.lastTestedAt,
      lastTestOk: CockpitConnectionTable.lastTestOk,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .limit(1);
  if (!row)
    return {
      connected: false,
      config: null,
      lastTestedAt: null,
      lastTestOk: null,
      updatedAt: null,
    };
  const decrypted = decryptConfig(row.configEncrypted);
  const parsed = decrypted ? revolutConfigSchema.safeParse(decrypted) : null;
  return {
    connected: true,
    config: parsed?.success
      ? {
          clientId: parsed.data.clientId,
          sandbox: parsed.data.sandbox,
          issuer: parsed.data.issuer ?? "",
          largeTransactionThreshold: parsed.data.largeTransactionThreshold,
          privateKeySet: true,
          refreshTokenSet: true,
        }
      : null,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveRevolutConnection(
  scope: StripeConnectionScope,
  input: RevolutConfigInput,
) {
  if (!isEncryptionAvailable()) throw new Error("encryption_unavailable");
  const [existing] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .limit(1);
  const previous = existing ? decryptConfig(existing.configEncrypted) : null;
  const oldParsed = previous ? revolutConfigSchema.safeParse(previous) : null;
  const oldConfig = oldParsed?.success ? oldParsed.data : null;
  const candidate = {
    clientId: input.clientId?.trim() || oldConfig?.clientId,
    privateKeyPem: input.privateKeyPem?.trim() || oldConfig?.privateKeyPem,
    refreshToken: oldConfig?.refreshToken,
    sandbox: input.sandbox,
    issuer: input.issuer?.trim() || "",
    largeTransactionThreshold: input.largeTransactionThreshold,
  };
  const authConfig = revolutAuthSchema.safeParse({
    clientId: candidate.clientId,
    privateKeyPem: candidate.privateKeyPem,
    sandbox: candidate.sandbox,
    issuer: candidate.issuer,
  });
  if (!authConfig.success) throw new Error("invalid_config");

  const credentialsChanged = Boolean(
    oldConfig &&
      (oldConfig.clientId !== authConfig.data.clientId ||
        oldConfig.privateKeyPem !== authConfig.data.privateKeyPem ||
        oldConfig.sandbox !== input.sandbox ||
        (oldConfig.issuer ?? "") !== (input.issuer?.trim() ?? "")),
  );
  const code = input.authorizationCode?.trim();
  if ((!oldConfig || credentialsChanged) && !code)
    throw new Error("authorization_required");

  let refreshToken = oldConfig?.refreshToken;
  if (code)
    refreshToken = await prepareRevolutConnection(authConfig.data, code);
  const finalConfig = revolutConfigSchema.safeParse({
    ...authConfig.data,
    refreshToken,
    largeTransactionThreshold: input.largeTransactionThreshold,
  });
  if (!finalConfig.success) throw new Error("invalid_config");

  const configEncrypted = encrypt(JSON.stringify(finalConfig.data));
  const conflict = scope.teamId
    ? {
        target: [
          CockpitConnectionTable.teamId,
          CockpitConnectionTable.provider,
        ],
        targetWhere: isNotNull(CockpitConnectionTable.teamId),
      }
    : {
        target: [
          CockpitConnectionTable.userId,
          CockpitConnectionTable.provider,
        ],
        targetWhere: isNull(CockpitConnectionTable.teamId),
      };
  await pgDb
    .insert(CockpitConnectionTable)
    .values({
      userId: scope.userId,
      teamId: scope.teamId,
      provider: "revolut",
      configEncrypted,
      secretEncrypted: null,
    })
    .onConflictDoUpdate({
      ...conflict,
      set: {
        userId: scope.userId,
        configEncrypted,
        secretEncrypted: null,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: new Date(),
      },
    });
  return getRevolutConnectionStatus(scope);
}

export async function testStoredRevolutConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .limit(1);
  if (!row) return false;
  const config = decryptConfig(row.configEncrypted);
  const ok = config ? await probeRevolut(config) : false;
  await pgDb
    .update(CockpitConnectionTable)
    .set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() })
    .where(
      and(
        eq(CockpitConnectionTable.id, row.id),
        scope.teamId
          ? eq(CockpitConnectionTable.teamId, scope.teamId)
          : and(
              eq(CockpitConnectionTable.userId, scope.userId),
              isNull(CockpitConnectionTable.teamId),
            ),
      ),
    );
  return ok;
}

export async function loadRevolutSummary(
  scope: StripeConnectionScope,
): Promise<RevolutSummary | null> {
  const [row] = await pgDb
    .select({ configEncrypted: CockpitConnectionTable.configEncrypted })
    .from(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .limit(1);
  if (!row) return null;
  const config = decryptConfig(row.configEncrypted);
  if (!config) throw new RevolutProviderError("invalid_response");
  return fetchRevolutSummary(config);
}

export async function removeRevolutConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const deleted = await pgDb
    .delete(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .returning({ id: CockpitConnectionTable.id });
  return deleted.length > 0;
}

export function publicRevolutError(error: unknown): string {
  if (error instanceof RevolutProviderError) {
    if (error.code === "unauthorized" || error.code === "reauthorize")
      return "Revolut rejected the credentials. Re-authorize the connection.";
    if (error.code === "invalid_response")
      return "Revolut returned an unexpected response.";
  }
  return "Unable to load Revolut account data.";
}
