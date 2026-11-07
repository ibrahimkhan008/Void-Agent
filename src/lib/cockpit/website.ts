import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { CockpitConnectionTable } from "lib/db/pg/schema.pg";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import { z } from "zod";
import type { StripeConnectionScope } from "./stripe";
import { type SiteEventRow, summarize } from "./website-metrics/marketing";
import type { MarketingSummary } from "./website-metrics/types";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const MAX_FETCH_MS = 15_000;

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length <= 253 &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
      url.hostname.split(".")[0].toLowerCase() !== "localhost" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export const websiteConfigSchema = z
  .object({
    supabaseUrl: z.string().trim().min(1).max(500).refine(isAllowedSupabaseUrl),
    supabaseSecretKey: z.string().trim().min(1).max(10_000),
    rangeDays: z.number().int().min(1).max(90),
  })
  .strict();

export const websiteSubmitSchema = z
  .object({
    supabaseUrl: z.string().trim().max(500).optional(),
    supabaseSecretKey: z.string().trim().max(10_000).optional(),
    rangeDays: z.number().int().min(1).max(90),
  })
  .strict();

export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;
export type WebsiteConfigInput = z.infer<typeof websiteSubmitSchema>;

export class WebsiteProviderError extends Error {
  constructor(
    readonly code: "unauthorized" | "unavailable" | "invalid_response",
  ) {
    super(code);
    this.name = "WebsiteProviderError";
  }
}

async function readJsonBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_PAGE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new WebsiteProviderError("invalid_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE_BYTES) {
        await reader.cancel();
        throw new WebsiteProviderError("invalid_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof WebsiteProviderError) throw error;
    throw new WebsiteProviderError("invalid_response");
  } finally {
    reader.releaseLock();
  }
}

function validateRows(value: unknown): SiteEventRow[] {
  if (!Array.isArray(value)) throw new WebsiteProviderError("invalid_response");
  return value.flatMap((item): SiteEventRow[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.created_at !== "string" ||
      typeof row.kind !== "string" ||
      (row.kind !== "pageview" && row.kind !== "event") ||
      typeof row.path !== "string" ||
      typeof row.channel !== "string" ||
      typeof row.source !== "string" ||
      typeof row.visitor_hash !== "string" ||
      typeof row.is_landing !== "boolean"
    )
      return [];
    return [
      {
        created_at: row.created_at.slice(0, 40),
        kind: row.kind,
        name: typeof row.name === "string" ? row.name.slice(0, 100) : null,
        path: row.path.slice(0, 500),
        is_landing: row.is_landing,
        channel: row.channel.slice(0, 100),
        source: row.source.slice(0, 200),
        utm_campaign:
          typeof row.utm_campaign === "string"
            ? row.utm_campaign.slice(0, 200)
            : null,
        visitor_hash: row.visitor_hash.slice(0, 200),
        props:
          row.props &&
          typeof row.props === "object" &&
          !Array.isArray(row.props)
            ? {
                form:
                  typeof (row.props as Record<string, unknown>).form ===
                  "string"
                    ? (row.props as Record<string, string>).form.slice(0, 100)
                    : null,
              }
            : null,
        host: typeof row.host === "string" ? row.host.slice(0, 253) : null,
        referrer_host:
          typeof row.referrer_host === "string"
            ? row.referrer_host.slice(0, 253)
            : null,
        utm_term:
          typeof row.utm_term === "string" ? row.utm_term.slice(0, 200) : null,
        country:
          typeof row.country === "string" ? row.country.slice(0, 100) : null,
        region:
          typeof row.region === "string" ? row.region.slice(0, 100) : null,
        city: typeof row.city === "string" ? row.city.slice(0, 100) : null,
        device:
          typeof row.device === "string" ? row.device.slice(0, 100) : null,
        browser:
          typeof row.browser === "string" ? row.browser.slice(0, 100) : null,
        os: typeof row.os === "string" ? row.os.slice(0, 100) : null,
      },
    ];
  });
}

export async function fetchWebsiteSummary(
  configInput: unknown,
  now = new Date(),
): Promise<MarketingSummary> {
  const parsed = websiteConfigSchema.safeParse(configInput);
  if (!parsed.success) throw new WebsiteProviderError("invalid_response");
  const config = parsed.data;
  const base = new URL(config.supabaseUrl);
  const since = new Date(
    now.getTime() - 2 * config.rangeDays * 86_400_000,
  ).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_FETCH_MS);
  const rows: SiteEventRow[] = [];
  try {
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const url = new URL("/rest/v1/site_events", base);
      url.searchParams.set("select", "*");
      url.searchParams.set("created_at", `gte.${since}`);
      url.searchParams.set("order", "created_at.desc");
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            apikey: config.supabaseSecretKey,
            Authorization: `Bearer ${config.supabaseSecretKey}`,
            Range: `${from}-${from + PAGE_SIZE - 1}`,
            "Range-Unit": "items",
          },
          signal: controller.signal,
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        throw new WebsiteProviderError("unavailable");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 401 || response.status === 403)
          throw new WebsiteProviderError("unauthorized");
        throw new WebsiteProviderError("unavailable");
      }
      const page = validateRows(await readJsonBounded(response));
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      if (from + PAGE_SIZE >= MAX_ROWS)
        throw new WebsiteProviderError("invalid_response");
    }
    return summarize(rows, config.rangeDays, now);
  } catch (error) {
    if (error instanceof WebsiteProviderError) throw error;
    throw new WebsiteProviderError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

const connectionWhere = (scope: StripeConnectionScope) =>
  scope.teamId
    ? and(
        eq(CockpitConnectionTable.teamId, scope.teamId),
        eq(CockpitConnectionTable.provider, "website"),
      )
    : and(
        eq(CockpitConnectionTable.userId, scope.userId),
        isNull(CockpitConnectionTable.teamId),
        eq(CockpitConnectionTable.provider, "website"),
      );

function decryptConfig(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const result: unknown = JSON.parse(decrypt(value));
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function getWebsiteConnectionStatus(scope: StripeConnectionScope) {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
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
  const raw = decryptConfig(row.configEncrypted);
  const config = raw ? websiteConfigSchema.safeParse(raw) : null;
  return {
    connected: true,
    config: config?.success
      ? {
          supabaseUrl: config.data.supabaseUrl,
          rangeDays: config.data.rangeDays,
          secretSet: true,
        }
      : null,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveWebsiteConnection(
  scope: StripeConnectionScope,
  input: WebsiteConfigInput,
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
  const oldConfig = existing ? decryptConfig(existing.configEncrypted) : null;
  const candidate = websiteConfigSchema.safeParse({
    supabaseUrl: input.supabaseUrl?.trim() || oldConfig?.supabaseUrl,
    supabaseSecretKey:
      input.supabaseSecretKey?.trim() || oldConfig?.supabaseSecretKey,
    rangeDays: input.rangeDays,
  });
  if (!candidate.success) throw new Error("invalid_config");
  const configEncrypted = encrypt(JSON.stringify(candidate.data));
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
      provider: "website",
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
  return getWebsiteConnectionStatus(scope);
}

export async function testWebsiteConnection(
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
  let ok = false;
  if (config) {
    try {
      await fetchWebsiteSummary(config);
      ok = true;
    } catch {
      ok = false;
    }
  }
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

export async function loadWebsiteSummary(
  scope: StripeConnectionScope,
): Promise<MarketingSummary | null> {
  const [row] = await pgDb
    .select({ configEncrypted: CockpitConnectionTable.configEncrypted })
    .from(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .limit(1);
  if (!row) return null;
  const config = decryptConfig(row.configEncrypted);
  if (!config) throw new WebsiteProviderError("invalid_response");
  return fetchWebsiteSummary(config);
}

export async function removeWebsiteConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const deleted = await pgDb
    .delete(CockpitConnectionTable)
    .where(connectionWhere(scope))
    .returning({ id: CockpitConnectionTable.id });
  return deleted.length > 0;
}

export function publicWebsiteError(error: unknown): string {
  if (error instanceof WebsiteProviderError && error.code === "unauthorized")
    return "Supabase rejected this key. Check its read access to site_events.";
  return "Unable to load website analytics.";
}
