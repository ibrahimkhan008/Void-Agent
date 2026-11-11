import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getBaseUrl } from "lib/const";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import type { ConnectorProvider } from "./providers-list";
import {
  getOAuthClientCredentials,
  OAUTH_PROVIDER_CONFIG,
  resolveProviderEndpoints,
} from "./oauth-providers";
import {
  consumeConnectorOAuthState,
  issueConnectorOAuthState,
} from "./oauth-state";

const MAX_OAUTH_CODE = 4096;
const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1024;
const NETWORK_TIMEOUT_MS = 12_000;
const TOKEN_PREFIX = "enc:v1:";

export type OAuthResult =
  | { ok: true; authUrl: string }
  | { ok: false; status: number; error: string };

export function getConnectorOAuthRedirectUri(
  provider: ConnectorProvider,
): string | null {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/" ||
      (process.env.NODE_ENV === "production" && base.protocol !== "https:") ||
      (base.protocol !== "https:" &&
        base.hostname !== "localhost" &&
        base.hostname !== "127.0.0.1")
    ) {
      return null;
    }
    return new URL(
      `/api/connectors/${provider}/callback`,
      base.origin,
    ).toString();
  } catch {
    return null;
  }
}

export function buildPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function beginConnectorOAuth(
  userId: string,
  provider: ConnectorProvider,
): Promise<OAuthResult> {
  const config = OAUTH_PROVIDER_CONFIG[provider];
  if (!config)
    return { ok: false, status: 404, error: "Connector is not available" };
  if (!isEncryptionAvailable()) {
    return {
      ok: false,
      status: 503,
      error: "Connector encryption is not configured",
    };
  }
  const credentials = getOAuthClientCredentials(config);
  if (!credentials) {
    return { ok: false, status: 503, error: "Connector is not configured" };
  }
  const redirectUri = getConnectorOAuthRedirectUri(provider);
  if (!redirectUri) {
    return {
      ok: false,
      status: 503,
      error: "Connector callback origin is not configured safely",
    };
  }

  try {
    const { authorizeUrl } = resolveProviderEndpoints(provider, config);
    const verifier = config.pkce
      ? randomBytes(32).toString("base64url")
      : undefined;
    const state = await issueConnectorOAuthState({
      userId,
      provider,
      redirectUri,
      verifier,
    });

    authorizeUrl.searchParams.set("client_id", credentials.clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    if (config.scopes.length)
      authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    for (const [key, value] of Object.entries(
      config.extraAuthorizeParams ?? {},
    )) {
      authorizeUrl.searchParams.set(key, value);
    }
    if (verifier) {
      authorizeUrl.searchParams.set(
        "code_challenge",
        buildPkceChallenge(verifier),
      );
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
    }
    return { ok: true, authUrl: authorizeUrl.toString() };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Connector authorization could not be started",
    };
  }
}

export async function finishConnectorOAuth(
  provider: ConnectorProvider,
  code: string,
  state: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { ok: true; email?: string; name?: string } | { ok: false; error: string }
> {
  if (
    !isEncryptionAvailable() ||
    code.length > MAX_OAUTH_CODE ||
    state.length > 128
  ) {
    return { ok: false, error: "Invalid or expired authorization" };
  }
  const stateData = await consumeConnectorOAuthState(state).catch(() => null);
  if (!stateData || stateData.provider !== provider) {
    return { ok: false, error: "Invalid or expired authorization" };
  }
  const expectedRedirectUri = getConnectorOAuthRedirectUri(provider);
  if (!expectedRedirectUri || stateData.redirectUri !== expectedRedirectUri) {
    return { ok: false, error: "Invalid or expired authorization" };
  }
  const config = OAUTH_PROVIDER_CONFIG[provider];
  const credentials = config && getOAuthClientCredentials(config);
  if (!config || !credentials)
    return { ok: false, error: "Connector is not configured" };
  if (config.pkce && !stateData.verifier) {
    return { ok: false, error: "Invalid or expired authorization" };
  }

  try {
    const { tokenUrl } = resolveProviderEndpoints(provider, config);
    const tokenParams = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: stateData.redirectUri,
    });
    if (config.tokenAuth !== "basic") {
      tokenParams.set("client_id", credentials.clientId);
    }
    if (config.tokenAuth !== "basic" && config.tokenAuth !== "pkce") {
      tokenParams.set("client_secret", credentials.clientSecret);
    }
    if (stateData.verifier)
      tokenParams.set("code_verifier", stateData.verifier);
    const tokenResponse = await fetchImpl(tokenUrl, {
      method: "POST",
      headers:
        config.tokenFormat === "json"
          ? {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(config.tokenAuth === "basic"
                ? {
                    Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
                  }
                : {}),
            }
          : {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
      body:
        config.tokenFormat === "json"
          ? JSON.stringify(Object.fromEntries(tokenParams.entries()))
          : tokenParams,
      redirect: "error",
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    const tokenBody = await readJsonBounded(tokenResponse);
    if (!tokenResponse.ok)
      return { ok: false, error: "Provider authorization failed" };
    const accessToken =
      config.tokenFromResponse?.(tokenBody) ??
      stringField(tokenBody, "access_token");
    if (!accessToken || accessToken.length > 16_384) {
      return { ok: false, error: "Provider did not return a valid token" };
    }

    let identity: Record<string, unknown> = {};
    if (config.identityUrl) {
      const identityResponse = await fetchImpl(config.identityUrl, {
        headers: config.identityHeaders?.(accessToken) ?? {
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
      identity = await readJsonBounded(identityResponse);
      if (
        !identityResponse.ok ||
        (provider === "slack" && identity.ok !== true)
      ) {
        return { ok: false, error: "Could not verify the provider account" };
      }
    }

    const email = config.identityEmail?.(
      provider === "notion" ? tokenBody : identity,
    );
    const name = config.identityName?.(
      provider === "notion" ? tokenBody : identity,
    );
    const refreshToken =
      config.refreshTokenFromResponse?.(tokenBody) ??
      stringField(tokenBody, "refresh_token");
    const expiresIn = numberField(tokenBody, "expires_in");
    const now = new Date();
    const tokenExpiresAt =
      expiresIn && expiresIn <= 365 * 24 * 60 * 60
        ? new Date(now.getTime() + expiresIn * 1000)
        : null;
    const encryptedAccess = encryptConnectorToken(
      stateData.userId,
      provider,
      "access",
      accessToken,
    );
    const encryptedRefresh = refreshToken
      ? encryptConnectorToken(
          stateData.userId,
          provider,
          "refresh",
          refreshToken,
        )
      : undefined;

    await pgDb
      .insert(UserConnectorTable)
      .values({
        userId: stateData.userId,
        provider,
        email: email?.slice(0, 320) ?? null,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh ?? null,
        tokenExpiresAt,
        scope:
          stringField(tokenBody, "scope")?.slice(0, 4096) ??
          config.scopes.join(" ").slice(0, 4096),
        isConnected: true,
        isPaused: false,
        lastSyncAt: now,
        metadata: { name: name?.slice(0, 160) ?? null },
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [UserConnectorTable.userId, UserConnectorTable.provider],
        set: {
          email: email?.slice(0, 320) ?? null,
          accessToken: encryptedAccess,
          ...(encryptedRefresh ? { refreshToken: encryptedRefresh } : {}),
          tokenExpiresAt,
          scope:
            stringField(tokenBody, "scope")?.slice(0, 4096) ??
            config.scopes.join(" ").slice(0, 4096),
          isConnected: true,
          isPaused: false,
          lastSyncAt: now,
          metadata: { name: name?.slice(0, 160) ?? null },
          updatedAt: now,
        },
      });
    return {
      ok: true,
      ...(email ? { email: email.slice(0, 320) } : {}),
      ...(name ? { name: name.slice(0, 160) } : {}),
    };
  } catch {
    // Never put provider response bodies, codes, tokens, or request URLs in logs.
    return {
      ok: false,
      error: "Provider authorization could not be completed",
    };
  }
}

export function encryptConnectorToken(
  userId: string,
  provider: ConnectorProvider,
  kind: "access" | "refresh",
  token: string,
): string {
  return (
    TOKEN_PREFIX + encrypt(JSON.stringify({ userId, provider, kind, token }))
  );
}

export function decryptConnectorToken(
  userId: string,
  provider: ConnectorProvider,
  kind: "access" | "refresh",
  value: string | null,
): string | null {
  if (!value?.startsWith(TOKEN_PREFIX) || !isEncryptionAvailable()) return null;
  try {
    const decoded = JSON.parse(
      decrypt(value.slice(TOKEN_PREFIX.length)),
    ) as Record<string, unknown>;
    if (
      decoded.userId !== userId ||
      decoded.provider !== provider ||
      decoded.kind !== kind ||
      typeof decoded.token !== "string" ||
      decoded.token.length > 16_384
    )
      return null;
    return decoded.token;
  } catch {
    return null;
  }
}

export async function disconnectConnector(
  userId: string,
  provider: ConnectorProvider,
) {
  await pgDb
    .update(UserConnectorTable)
    .set({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isConnected: false,
      isPaused: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, provider),
      ),
    );
}

async function readJsonBounded(
  response: Response,
): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw new Error("Provider response too large");
  }
  if (!response.body) throw new Error("Provider response unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Provider response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid provider response");
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
