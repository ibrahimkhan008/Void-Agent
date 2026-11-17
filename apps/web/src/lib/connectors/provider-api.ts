import "server-only";

import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { decryptConnectorToken, encryptConnectorToken } from "./oauth-flow";
import {
  OAUTH_PROVIDER_CONFIG,
  getOAuthClientCredentials,
  resolveProviderEndpoints,
} from "./oauth-providers";
import type { ConnectorProvider } from "./providers-list";

const MAX_RESPONSE_BYTES = 512 * 1024;
const API_ORIGINS: Partial<Record<ConnectorProvider, string>> = {
  gmail: "https://gmail.googleapis.com",
  "google-drive": "https://www.googleapis.com",
  "google-calendar": "https://www.googleapis.com",
  "google-docs": "https://docs.googleapis.com",
  "google-sheets": "https://sheets.googleapis.com",
  "google-forms": "https://forms.googleapis.com",
  "google-slides": "https://slides.googleapis.com",
  "google-tasks": "https://tasks.googleapis.com",
  "google-keep": "https://keep.googleapis.com",
  "google-meet": "https://meet.googleapis.com",
  youtube: "https://www.googleapis.com",
  github: "https://api.github.com",
  outlook: "https://graph.microsoft.com",
  teams: "https://graph.microsoft.com",
  slack: "https://slack.com",
  notion: "https://api.notion.com",
  asana: "https://app.asana.com",
  clickup: "https://api.clickup.com",
  linear: "https://api.linear.app",
  // Productboard API v2 lives under the /v2 path; tool paths include it
  // because the origin check below compares URL origins (never paths).
  productboard: "https://api.productboard.com",
  jira: "https://api.atlassian.com",
};

function getApiOrigin(provider: ConnectorProvider): string | undefined {
  if (provider === "zendesk") {
    const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim().toLowerCase();
    if (!subdomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain))
      return undefined;
    return `https://${subdomain}.zendesk.com`;
  }
  if (provider === "freshdesk") return getFreshdeskOrigin();
  return API_ORIGINS[provider];
}

export function getFreshdeskOrigin(): string | undefined {
  const subdomain = process.env.FRESHDESK_SUBDOMAIN?.trim().toLowerCase();
  if (!subdomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain))
    return undefined;
  return `https://${subdomain}.freshdesk.com`;
}
const refreshFlights = new Map<string, Promise<string>>();

export class ConnectorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorApiError";
  }
}

export async function getConnectorAccessToken(
  userId: string,
  provider: ConnectorProvider,
): Promise<string> {
  if (!userId)
    throw new ConnectorApiError("Authenticated user context is required");
  const [row] = await pgDb
    .select({
      accessToken: UserConnectorTable.accessToken,
      refreshToken: UserConnectorTable.refreshToken,
      isConnected: UserConnectorTable.isConnected,
      isPaused: UserConnectorTable.isPaused,
      tokenExpiresAt: UserConnectorTable.tokenExpiresAt,
    })
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, provider),
      ),
    )
    .limit(1);
  if (!row?.isConnected || row.isPaused) {
    throw new ConnectorApiError(`${provider} is not connected for this user`);
  }
  let token = decryptConnectorToken(
    userId,
    provider,
    "access",
    row.accessToken,
  );
  if (!token)
    throw new ConnectorApiError(
      `${provider} token is unavailable; reconnect it`,
    );
  if (
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() <= Date.now() + 30_000
  ) {
    const key = `${userId}:${provider}`;
    const inflight = refreshFlights.get(key);
    if (inflight) return inflight;
    const refreshPromise = refreshExpiredToken(userId, provider, row).finally(
      () => {
        refreshFlights.delete(key);
      },
    );
    refreshFlights.set(key, refreshPromise);
    token = await refreshPromise;
  }
  return token;
}

async function refreshExpiredToken(
  userId: string,
  provider: ConnectorProvider,
  initial: {
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
  },
): Promise<string> {
  const config = OAUTH_PROVIDER_CONFIG[provider];
  const credentials = config && getOAuthClientCredentials(config);
  const refreshToken = decryptConnectorToken(
    userId,
    provider,
    "refresh",
    initial.refreshToken,
  );
  if (!config || !credentials || !refreshToken) {
    throw new ConnectorApiError(
      `${provider} authorization expired; reconnect it`,
    );
  }
  // Another request or instance may have refreshed since the original read.
  const [latest] = await pgDb
    .select({
      accessToken: UserConnectorTable.accessToken,
      refreshToken: UserConnectorTable.refreshToken,
      tokenExpiresAt: UserConnectorTable.tokenExpiresAt,
    })
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, provider),
      ),
    )
    .limit(1);
  if (!latest?.accessToken || !latest.refreshToken) {
    throw new ConnectorApiError(
      `${provider} authorization expired; reconnect it`,
    );
  }
  if (
    latest.tokenExpiresAt &&
    latest.tokenExpiresAt.getTime() > Date.now() + 30_000
  ) {
    const latestToken = decryptConnectorToken(
      userId,
      provider,
      "access",
      latest.accessToken,
    );
    if (latestToken) return latestToken;
  }
  const actualRefreshToken = decryptConnectorToken(
    userId,
    provider,
    "refresh",
    latest.refreshToken,
  );
  if (!actualRefreshToken)
    throw new ConnectorApiError(
      `${provider} authorization expired; reconnect it`,
    );

  const { tokenUrl } = resolveProviderEndpoints(provider, config);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: actualRefreshToken,
  });
  if (config.tokenAuth === "basic") {
    // Notion does not issue refresh tokens; reaching this is a stale or invalid row.
    throw new ConnectorApiError(
      `${provider} authorization expired; reconnect it`,
    );
  }
  body.set("client_id", credentials.clientId);
  if (config.tokenAuth !== "pkce")
    body.set("client_secret", credentials.clientSecret);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const result = await readJsonBounded(response, 128 * 1024);
  const newAccess =
    config.tokenFromResponse?.(result) ?? stringField(result, "access_token");
  if (!response.ok || !newAccess || newAccess.length > 16_384) {
    throw new ConnectorApiError(
      `${provider} authorization expired; reconnect it`,
    );
  }
  const newRefresh =
    config.refreshTokenFromResponse?.(result) ??
    stringField(result, "refresh_token");
  const expiresIn = numberField(result, "expires_in");
  const now = new Date();
  const encryptedAccess = encryptConnectorToken(
    userId,
    provider,
    "access",
    newAccess,
  );
  const encryptedRefresh = newRefresh
    ? encryptConnectorToken(userId, provider, "refresh", newRefresh)
    : latest.refreshToken;
  const [updated] = await pgDb
    .update(UserConnectorTable)
    .set({
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt:
        expiresIn && expiresIn <= 365 * 24 * 60 * 60
          ? new Date(now.getTime() + expiresIn * 1000)
          : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, provider),
        eq(UserConnectorTable.accessToken, latest.accessToken),
      ),
    )
    .returning({ id: UserConnectorTable.id });
  if (updated) return newAccess;
  const [raced] = await pgDb
    .select({ accessToken: UserConnectorTable.accessToken })
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, provider),
      ),
    )
    .limit(1);
  const racedToken = decryptConnectorToken(
    userId,
    provider,
    "access",
    raced?.accessToken ?? null,
  );
  if (racedToken) return racedToken;
  throw new ConnectorApiError(
    `${provider} authorization expired; reconnect it`,
  );
}

/** Calls a fixed first-party provider API origin; paths cannot change origin. */
export async function callConnectorApi(
  userId: string,
  provider: ConnectorProvider,
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: string;
    contentType?: string;
    maxResponseBytes?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const apiOrigin = getApiOrigin(provider);
  if (!apiOrigin) throw new ConnectorApiError("Connector API is unavailable");
  const token = await getConnectorAccessToken(userId, provider);
  let url: URL;
  try {
    url = new URL(path, apiOrigin);
  } catch {
    throw new ConnectorApiError("Invalid provider request");
  }
  if (url.origin !== apiOrigin || url.username || url.password || url.hash) {
    throw new ConnectorApiError("Invalid provider request");
  }
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const method = options.method ?? "GET";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization:
        provider === "freshdesk"
          ? `Basic ${Buffer.from(`${token}:X`).toString("base64")}`
          : `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body !== undefined || options.rawBody !== undefined
        ? { "Content-Type": options.contentType ?? "application/json" }
        : {}),
      ...(provider === "github"
        ? { "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Void Agent" }
        : {}),
      ...(provider === "notion" ? { "Notion-Version": "2022-06-28" } : {}),
      ...options.headers,
    },
    ...(options.rawBody !== undefined
      ? { body: options.rawBody }
      : options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readJsonBounded(
    response,
    options.maxResponseBytes ?? MAX_RESPONSE_BYTES,
  );
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ConnectorApiError(`${provider} did not authorize this action`);
    }
    throw new ConnectorApiError(
      `${provider} request failed (${response.status})`,
    );
  }
  return payload;
}

export async function callConnectorTextApi(
  userId: string,
  provider: ConnectorProvider,
  path: string,
  options: Parameters<typeof callConnectorApi>[3] = {},
): Promise<string> {
  const apiOrigin = getApiOrigin(provider);
  if (!apiOrigin) throw new ConnectorApiError("Connector API is unavailable");
  const token = await getConnectorAccessToken(userId, provider);
  const url = new URL(path, apiOrigin);
  if (url.origin !== apiOrigin)
    throw new ConnectorApiError("Invalid provider request");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization:
        provider === "freshdesk"
          ? `Basic ${Buffer.from(`${token}:X`).toString("base64")}`
          : `Bearer ${token}`,
      ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      ...(provider === "github" ? { "User-Agent": "Void Agent" } : {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new ConnectorApiError(
      `${provider} request failed (${response.status})`,
    );
  return readTextBounded(
    response,
    options.maxResponseBytes ?? MAX_RESPONSE_BYTES,
  );
}

async function readTextBounded(
  response: Response,
  limit: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new ConnectorApiError("Provider response exceeded the size limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ConnectorApiError("Provider response exceeded the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function readJsonBounded(
  response: Response,
  limit: number,
): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new ConnectorApiError("Provider response exceeded the size limit");
  }
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ConnectorApiError("Provider response exceeded the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return { items: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ConnectorApiError("Provider returned an invalid response");
  }
  return parsed as Record<string, unknown>;
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length <= 16_384
    ? value
    : undefined;
}

function numberField(
  body: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
