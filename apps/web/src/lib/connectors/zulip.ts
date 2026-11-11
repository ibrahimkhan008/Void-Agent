import "server-only";

import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { decryptConnectorToken } from "./oauth-flow";
import { ConnectorApiError } from "./provider-api";

const MAX_RESPONSE_BYTES = 512 * 1024;
/**
 * A pinned Zulip realm host must be an HTTPS FQDN: dotted DNS labels only,
 * alphabetic TLD, no IP literals (an IPv4 last label is numeric and IPv6 has
 * colons), no single-label hosts such as `localhost`. The realm is pinned at
 * credential save time and re-derived at dispatch time, so user input can
 * never change the host of a Zulip API call.
 */
const REALM_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Validate a user-supplied realm URL and return the exact pinned origin
 * (`https://host`) or null. Rejects non-HTTPS, embedded credentials, explicit
 * ports, query strings, fragments, and non-FQDN hosts.
 */
export function normalizeZulipRealmUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const hostname = url.hostname.toLowerCase();
  if (!REALM_HOST_PATTERN.test(hostname)) return null;
  return `https://${hostname}`;
}

export type ZulipCredential = {
  realmUrl: string;
  email: string;
  apiKey: string;
};

/**
 * Resolve the signed-in user's own Zulip credentials. The stored realm URL is
 * re-validated and must equal its normalized form, so a row that was tampered
 * with after save cannot redirect dispatch to a different host.
 */
export async function getZulipCredential(
  userId: string,
): Promise<ZulipCredential> {
  if (!userId)
    throw new ConnectorApiError("Authenticated user context is required");
  const [row] = await pgDb
    .select({
      email: UserConnectorTable.email,
      accessToken: UserConnectorTable.accessToken,
      isConnected: UserConnectorTable.isConnected,
      isPaused: UserConnectorTable.isPaused,
      metadata: UserConnectorTable.metadata,
    })
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "zulip"),
      ),
    )
    .limit(1);
  if (!row?.isConnected || row.isPaused) {
    throw new ConnectorApiError("Zulip is not connected for this user");
  }
  const storedRealm =
    row.metadata &&
    typeof (row.metadata as Record<string, unknown>).realmUrl === "string"
      ? ((row.metadata as Record<string, unknown>).realmUrl as string)
      : null;
  const realmUrl = storedRealm ? normalizeZulipRealmUrl(storedRealm) : null;
  if (!realmUrl || realmUrl !== storedRealm) {
    throw new ConnectorApiError(
      "Zulip realm URL is not pinned; reconnect Zulip in settings",
    );
  }
  const apiKey = decryptConnectorToken(
    userId,
    "zulip",
    "access",
    row.accessToken,
  );
  const email = typeof row.email === "string" ? row.email : null;
  if (!apiKey || !email) {
    throw new ConnectorApiError(
      "Zulip credentials are unavailable; reconnect Zulip in settings",
    );
  }
  return { realmUrl, email, apiKey };
}

/**
 * Call a fixed path on the user's pinned Zulip realm. The URL host always
 * comes from the stored pinned origin, redirects are refused, and responses
 * are size-bounded JSON.
 */
export async function callZulipApi(
  userId: string,
  path: "/api/v1/streams" | "/api/v1/messages",
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    body?: Record<string, string>;
  } = {},
): Promise<Record<string, unknown>> {
  const { realmUrl, email, apiKey } = await getZulipCredential(userId);
  let url: URL;
  try {
    url = new URL(path, realmUrl);
  } catch {
    throw new ConnectorApiError("Invalid Zulip request");
  }
  if (url.origin !== realmUrl || url.username || url.password || url.hash) {
    throw new ConnectorApiError("Invalid Zulip request");
  }
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`,
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readJsonBounded(response, MAX_RESPONSE_BYTES);
  if (!response.ok) {
    throw new ConnectorApiError(`Zulip request failed (${response.status})`);
  }
  if (payload.result === "error") {
    throw new ConnectorApiError("Zulip request failed");
  }
  return payload;
}

async function readJsonBounded(
  response: Response,
  limit: number,
): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new ConnectorApiError("Zulip response exceeded the size limit");
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
      throw new ConnectorApiError("Zulip response exceeded the size limit");
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
  if (Array.isArray(parsed)) return { items: parsed };
  if (!parsed || typeof parsed !== "object") {
    throw new ConnectorApiError("Zulip returned an invalid response");
  }
  return parsed as Record<string, unknown>;
}
