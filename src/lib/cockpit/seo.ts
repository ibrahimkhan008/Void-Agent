import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { CockpitConnectionTable } from "lib/db/pg/schema.pg";
import { decrypt, encrypt, isEncryptionAvailable } from "lib/security/encryption";
import { z } from "zod";
import type { StripeConnectionScope } from "./stripe";

const DATAFORSEO_MCP = "https://mcp.dataforseo.com/v3/mcp";
const DEADLINE_MS = 6_000;
const MAX_RESULT_BYTES = 1_000_000;
const MAX_TOOLS = 100;
const TOOL_PATTERNS = {
  overview: [/domain_rank_overview/iu, /domain[_-]?overview/iu, /overview/iu],
  keywords: [/ranked_keywords/iu, /domain[_-]?keywords/iu, /keywords_for_site/iu, /ranked/iu],
  backlinks: [/backlinks_summary/iu, /backlink.*summary/iu, /referring_domains/iu, /backlinks?/iu],
};

export const seoConfigSchema = z.object({
  kind: z.literal("dataforseo").default("dataforseo"),
  login: z.string().trim().min(1).max(200).refine((v) => !/[\r\n\0]/u.test(v)),
  password: z.string().trim().min(1).max(1000).refine((v) => !/[\r\n\0]/u.test(v)),
  domain: z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u),
  locationName: z.string().trim().max(100).optional().default("United States"),
  languageCode: z.string().trim().max(10).regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u).optional().default("en"),
}).strict();
export const seoSubmitSchema = z.object({
  kind: z.literal("dataforseo").optional(),
  login: z.string().trim().max(200).optional(),
  password: z.string().trim().max(1000).optional(),
  domain: z.string().trim().max(253).optional(),
  locationName: z.string().trim().max(100).optional(),
  languageCode: z.string().trim().max(10).optional(),
}).strict();
export type SeoSummary = {
  domain: string;
  organicTraffic: number | null;
  keywordsCount: number | null;
  referringDomains: number | null;
  topKeywords: Array<{ keyword: string; position: number | null; previousPosition: number | null; volume: number | null }>;
};
type SeoConfig = z.infer<typeof seoConfigSchema>;
type McpTool = { name: string; inputSchema?: { properties?: Record<string, unknown> } };

export function createBoundedSeoFetch(maxBytes = MAX_RESULT_BYTES) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.protocol !== "https:" || url.hostname !== "mcp.dataforseo.com" || url.pathname !== "/v3/mcp" || url.search || url.hash || url.port || url.username || url.password)
      throw new Error("seo_endpoint_rejected");
    const response = await fetch(input, { ...init, redirect: "error" });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) { await response.body?.cancel(); throw new Error("seo_response_too_large"); }
    if (!response.body) return response;
    const reader = response.body.getReader();
    let bytes = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) return controller.close();
          bytes += part.value.byteLength;
          if (bytes > maxBytes) { await reader.cancel(); controller.error(new Error("seo_response_too_large")); return; }
          controller.enqueue(part.value);
        } catch (error) { controller.error(error); }
      },
      cancel(reason) { return reader.cancel(reason); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

function findTool(tools: McpTool[], patterns: RegExp[]) {
  return tools.find((tool) =>
    !/(?:^|[_-])(create|delete|remove|update|write|set|submit|purchase|change)(?:$|[_-])/iu.test(tool.name) &&
    patterns.some((pattern) => pattern.test(tool.name)),
  );
}
function findArray(value: unknown): Array<Record<string, unknown>> {
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): Array<Record<string, unknown>> => {
    if (!v || typeof v !== "object" || depth > 5 || seen.has(v)) return [];
    seen.add(v);
    if (Array.isArray(v)) {
      const direct = v.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
      if (direct.some((item) => "keyword" in item || "keyword_data" in item)) return direct.slice(0, 100);
      for (const item of direct) { const nested = visit(item, depth + 1); if (nested.length) return nested; }
      return [];
    }
    const row = v as Record<string, unknown>;
    for (const key of ["items", "results", "data", "tasks", "result"])
      if (Array.isArray(row[key])) return visit(row[key], depth + 1);
    for (const child of Object.values(row)) { const result = visit(child, depth + 1); if (result.length) return result; }
    return [];
  };
  return visit(value, 0);
}
function numberAt(value: unknown, keys: string[]): number | null {
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number): number | null => {
    if (!node || typeof node !== "object" || depth > 5 || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) { for (const item of node.slice(0, 100)) { const n = visit(item, depth + 1); if (n !== null) return n; } return null; }
    const record = node as Record<string, unknown>;
    for (const key of keys) { const value = record[key]; if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value)); }
    for (const child of Object.values(record)) { const n = visit(child, depth + 1); if (n !== null) return n; }
    return null;
  };
  return visit(value, 0);
}
function text(value: unknown, limit = 200): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null; }
export function summarizeSeo(input: { domain: string; overview: unknown; keywords: unknown; backlinks: unknown }): SeoSummary {
  const rows = findArray(input.keywords).filter((row) => typeof row.keyword === "string" || typeof (row.keyword_data as Record<string, unknown> | undefined)?.keyword === "string");
  const topKeywords = rows.slice(0, 10).map((row) => {
    const data = (row.keyword_data && typeof row.keyword_data === "object" ? row.keyword_data : row) as Record<string, unknown>;
    const ranked = (row.ranked_serp_element && typeof row.ranked_serp_element === "object" ? row.ranked_serp_element : {}) as Record<string, unknown>;
    const info = (data.keyword_info && typeof data.keyword_info === "object" ? data.keyword_info : {}) as Record<string, unknown>;
    const pos = row.position ?? row.rank_absolute ?? ranked.rank_absolute ?? ranked.rank_group;
    const previous = row.previous_position ?? row.previousPosition ?? row.previous_rank_absolute;
    const volume = info.search_volume ?? data.search_volume ?? data.volume ?? row.volume;
    return { keyword: text(data.keyword) ?? text(row.keyword) ?? "", position: typeof pos === "number" && Number.isFinite(pos) ? Math.max(0, Math.floor(pos)) : null, previousPosition: typeof previous === "number" && Number.isFinite(previous) ? Math.max(0, Math.floor(previous)) : null, volume: typeof volume === "number" && Number.isFinite(volume) ? Math.max(0, Math.floor(volume)) : null };
  }).filter((item) => item.keyword);
  return {
    domain: input.domain,
    organicTraffic: numberAt(input.overview, ["etv", "organic_traffic", "organicTraffic", "traffic"]),
    keywordsCount: numberAt(input.overview, ["count", "keywords_count", "keywordsCount", "organic_keywords"]) ?? numberAt(input.keywords, ["total_count", "totalCount"]),
    referringDomains: numberAt(input.backlinks, ["referring_domains", "referringDomains"]),
    topKeywords,
  };
}

async function fetchSeoSummary(config: SeoConfig): Promise<SeoSummary> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  const auth = Buffer.from(`${config.login}:${config.password}`).toString("base64");
  const transport = new StreamableHTTPClientTransport(new URL(DATAFORSEO_MCP), {
    requestInit: { headers: { Authorization: `Basic ${auth}` }, signal: controller.signal },
    fetch: createBoundedSeoFetch(),
  });
  const client = new Client({ name: "void-agent-cockpit-seo", version: "1.0.0" });
  try {
    await client.connect(transport, { maxTotalTimeout: DEADLINE_MS });
    const tools = ((await client.listTools()).tools ?? []).slice(0, MAX_TOOLS) as McpTool[];
    const overview = findTool(tools, TOOL_PATTERNS.overview);
    const keywords = findTool(tools, TOOL_PATTERNS.keywords);
    const backlinks = findTool(tools, TOOL_PATTERNS.backlinks);
    if (!overview && !keywords) throw new Error("seo_tool_missing");
    const makeArgs = (tool: McpTool, extra: Record<string, unknown> = {}) => {
      const props = tool.inputSchema?.properties ?? {};
      const args: Record<string, unknown> = {};
      for (const key of ["target", "domain", "site", "url", "website"]) if (key in props) args[key] = config.domain;
      for (const key of ["location_name", "locationName", "location"]) if (key in props) args[key] = config.locationName;
      for (const key of ["language_code", "languageCode", "language"]) if (key in props) args[key] = config.languageCode;
      for (const [key, value] of Object.entries(extra)) if (key in props) args[key] = value;
      return args;
    };
    const call = async (tool: McpTool, extra: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name: tool.name, arguments: makeArgs(tool, extra) });
      if (result.isError) throw new Error("seo_tool_failed");
      if (result.structuredContent !== undefined) return result.structuredContent;
      const content = Array.isArray(result.content) ? result.content : [];
      const joined = content.flatMap((part) => part.type === "text" ? [part.text] : []).join("").slice(0, MAX_RESULT_BYTES);
      try { return JSON.parse(joined) as unknown; } catch { return joined; }
    };
    const [o, k, b] = await Promise.all([
      overview ? call(overview) : null,
      keywords ? call(keywords, { limit: 10, order_by: ["keyword_data.keyword_info.search_volume,desc"] }) : null,
      backlinks ? call(backlinks).catch(() => null) : null,
    ]);
    return summarizeSeo({ domain: config.domain, overview: o, keywords: k, backlinks: b });
  } finally {
    clearTimeout(timer);
    controller.abort();
    await client.close().catch(() => undefined);
  }
}

function scopeWhere(scope: StripeConnectionScope) {
  return and(eq(CockpitConnectionTable.provider, "seo"), scope.teamId
    ? eq(CockpitConnectionTable.teamId, scope.teamId)
    : and(eq(CockpitConnectionTable.userId, scope.userId), isNull(CockpitConnectionTable.teamId)));
}
function openConfig(value: string | null) {
  if (!value) return null;
  try { const parsed: unknown = JSON.parse(decrypt(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; }
}
export async function getSeoConnectionStatus(scope: StripeConnectionScope) {
  const [row] = await pgDb.select({ configEncrypted: CockpitConnectionTable.configEncrypted, lastTestedAt: CockpitConnectionTable.lastTestedAt, lastTestOk: CockpitConnectionTable.lastTestOk, updatedAt: CockpitConnectionTable.updatedAt }).from(CockpitConnectionTable).where(scopeWhere(scope)).limit(1);
  if (!row) return { connected: false, credentialSet: false, domain: null, lastTestedAt: null, lastTestOk: null, updatedAt: null };
  const config = openConfig(row.configEncrypted);
  const parsed = config ? seoConfigSchema.safeParse(config) : null;
  return { connected: true, credentialSet: !!parsed?.success, domain: parsed?.success ? parsed.data.domain : null, lastTestedAt: row.lastTestedAt?.toISOString() ?? null, lastTestOk: row.lastTestOk, updatedAt: row.updatedAt.toISOString() };
}
export async function saveSeoConnection(scope: StripeConnectionScope, input: z.infer<typeof seoSubmitSchema>) {
  if (!isEncryptionAvailable()) throw new Error("encryption_unavailable");
  const [existing] = await pgDb.select({ id: CockpitConnectionTable.id, configEncrypted: CockpitConnectionTable.configEncrypted }).from(CockpitConnectionTable).where(scopeWhere(scope)).limit(1);
  const old = existing ? openConfig(existing.configEncrypted) : null;
  const parsed = seoConfigSchema.safeParse({ ...old, ...input, password: input.password?.trim() || old?.password, login: input.login?.trim() || old?.login, domain: input.domain?.trim() || old?.domain, kind: "dataforseo" });
  if (!parsed.success) throw new Error("invalid_config");
  const configEncrypted = encrypt(JSON.stringify(parsed.data));
  const conflict = scope.teamId ? { target: [CockpitConnectionTable.teamId, CockpitConnectionTable.provider], targetWhere: isNotNull(CockpitConnectionTable.teamId) } : { target: [CockpitConnectionTable.userId, CockpitConnectionTable.provider], targetWhere: isNull(CockpitConnectionTable.teamId) };
  await pgDb.insert(CockpitConnectionTable).values({ userId: scope.userId, teamId: scope.teamId, provider: "seo", configEncrypted, secretEncrypted: null }).onConflictDoUpdate({ ...conflict, set: { userId: scope.userId, configEncrypted, secretEncrypted: null, lastTestedAt: null, lastTestOk: null, updatedAt: new Date() } });
  return getSeoConnectionStatus(scope);
}
export async function testStoredSeoConnection(scope: StripeConnectionScope) {
  const [row] = await pgDb.select({ id: CockpitConnectionTable.id, configEncrypted: CockpitConnectionTable.configEncrypted }).from(CockpitConnectionTable).where(scopeWhere(scope)).limit(1);
  if (!row) return false;
  const config = openConfig(row.configEncrypted);
  let ok = false;
  const parsed = config ? seoConfigSchema.safeParse(config) : null;
  if (parsed?.success) { try { await fetchSeoSummary(parsed.data); ok = true; } catch { ok = false; } }
  await pgDb.update(CockpitConnectionTable).set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() }).where(and(eq(CockpitConnectionTable.id, row.id), scopeWhere(scope)));
  return ok;
}
export async function loadSeoSummary(scope: StripeConnectionScope) {
  const [row] = await pgDb.select({ configEncrypted: CockpitConnectionTable.configEncrypted }).from(CockpitConnectionTable).where(scopeWhere(scope)).limit(1);
  if (!row) return null;
  const config = openConfig(row.configEncrypted);
  const parsed = config ? seoConfigSchema.safeParse(config) : null;
  if (!parsed?.success) throw new Error("seo_invalid_config");
  return fetchSeoSummary(parsed.data);
}
export async function removeSeoConnection(scope: StripeConnectionScope) {
  return (await pgDb.delete(CockpitConnectionTable).where(scopeWhere(scope)).returning({ id: CockpitConnectionTable.id })).length > 0;
}
export function publicSeoError(error: unknown) {
  if (error instanceof Error && error.message === "seo_tool_missing") return "DataForSEO did not expose a supported domain overview or ranked keywords tool.";
  return "Unable to load SEO data. Check the DataForSEO credentials and try again.";
}
