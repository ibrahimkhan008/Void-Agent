import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

const SUPERLOG_MCP = "https://api.superlog.sh/mcp";
const MAX_RESULT_BYTES = 1_000_000;
const MAX_ROWS = 500;
const DEADLINE_MS = 6_000;
const INVALID_KEY_PREFIX = /^(?:sl_public_|superlog_live_|sl_management_)/u;

export const superlogConfigSchema = z
  .object({ token: z.string().trim().min(12).max(2_000) })
  .strict();
export const superlogSubmitSchema = z
  .object({ token: z.string().trim().max(2_000).optional() })
  .strict();
export type SuperlogSummary = {
  openIncidents: number;
  incidents24h: number;
  firingAlerts: number;
  errors24h: number | null;
  incidents: Array<{
    id: string;
    title: string;
    status: string;
    severity: string | null;
    service: string | null;
    startedAt: string | null;
  }>;
  services: Array<{ name: string; openIncidents: number; errors24h: number }>;
};
export type SuperlogConfigInput = z.infer<typeof superlogSubmitSchema>;

export function createBoundedSuperlogFetch(maxBytes = MAX_RESULT_BYTES) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.superlog.sh" ||
      url.pathname !== "/mcp" ||
      url.search ||
      url.hash ||
      url.port ||
      url.username ||
      url.password
    )
      throw new Error("superlog_endpoint_rejected");
    const response = await fetch(input, { ...init, redirect: "error" });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new Error("superlog_response_too_large");
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    let bytes = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) {
            controller.close();
            return;
          }
          bytes += part.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            controller.error(new Error("superlog_response_too_large"));
            return;
          }
          controller.enqueue(part.value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function rows(value: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(value)) return value.slice(0, MAX_ROWS);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key]))
      return (record[key] as unknown[]).slice(0, MAX_ROWS);
  }
  return [];
}

function text(value: unknown, max = 160): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

export function summarizeSuperlog(input: {
  open: unknown;
  recent: unknown;
  alerts: unknown;
  errors: unknown;
  now: number;
}): SuperlogSummary {
  const asIncidents = (value: unknown) =>
    rows(value, "incidents", "items", "results").flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const r = item as Record<string, unknown>;
      const id = text(r.id, 100);
      if (!id) return [];
      return [
        {
          id,
          title: text(r.title) ?? text(r.codename) ?? id,
          status: text(r.status, 40) ?? "unknown",
          severity: text(r.severity, 40),
          service: text(r.service, 100),
          startedAt: text(r.firstSeen) ?? text(r.first_seen, 40),
        },
      ];
    });
  const open = asIncidents(input.open).filter(
    (incident) => incident.status.toLowerCase() === "open",
  );
  const since = input.now - 86_400_000;
  const recent = asIncidents(input.recent).filter((incident) => {
    if (!incident.startedAt) return false;
    const time = Date.parse(incident.startedAt);
    return Number.isFinite(time) && time >= since;
  });
  const errorRows =
    input.errors === null ? null : rows(input.errors, "rows", "logs", "items");
  const serviceMap = new Map<
    string,
    { openIncidents: number; errors24h: number }
  >();
  const bump = (name: string | null, key: "openIncidents" | "errors24h") => {
    if (!name) return;
    const value = serviceMap.get(name) ?? { openIncidents: 0, errors24h: 0 };
    value[key]++;
    serviceMap.set(name, value);
  };
  for (const incident of open) bump(incident.service, "openIncidents");
  for (const error of errorRows ?? []) {
    if (!error || typeof error !== "object" || Array.isArray(error)) continue;
    const row = error as Record<string, unknown>;
    bump(text(row.service) ?? text(row.service_name), "errors24h");
  }
  const count = numeric((input.open as { count?: unknown } | null)?.count);
  const firingAlerts = rows(input.alerts, "alerts", "items").filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const r = item as Record<string, unknown>;
    const state =
      text(r.state) ??
      text(r.status) ??
      text(r.lastState) ??
      text(r.last_state);
    return (
      !!state &&
      /firing|alerting|triggered|active/iu.test(state) &&
      !/inactive/iu.test(state)
    );
  }).length;
  return {
    openIncidents: Math.max(open.length, count ?? 0),
    incidents24h: recent.length,
    firingAlerts,
    errors24h: errorRows === null ? null : errorRows.length,
    incidents: open.slice(0, 20),
    services: [...serviceMap.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort(
        (a, b) =>
          b.openIncidents - a.openIncidents || b.errors24h - a.errors24h,
      )
      .slice(0, 50),
  };
}

type McpTool = {
  name: string;
  inputSchema?: { properties?: Record<string, unknown> };
};

async function withSuperlog<T>(
  token: string,
  run: (
    tools: McpTool[],
    call: (tool: McpTool, args: Record<string, unknown>) => Promise<unknown>,
  ) => Promise<T>,
) {
  if (INVALID_KEY_PREFIX.test(token))
    throw new Error("superlog_wrong_key_type");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  const transport = new StreamableHTTPClientTransport(new URL(SUPERLOG_MCP), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    },
    fetch: createBoundedSuperlogFetch(MAX_RESULT_BYTES),
  });
  const client = new Client({
    name: "void-agent-cockpit-superlog",
    version: "1.0.0",
  });
  try {
    await client.connect(transport, { maxTotalTimeout: DEADLINE_MS });
    const listing = await client.listTools();
    const tools = (listing.tools ?? []).slice(0, 100) as McpTool[];
    const call = async (tool: McpTool, args: Record<string, unknown>) => {
      const declared = tool.inputSchema?.properties ?? {};
      const input = Object.fromEntries(
        Object.entries(args).filter(
          ([key, value]) => value !== undefined && key in declared,
        ),
      );
      const response = await client.callTool({
        name: tool.name,
        arguments: input,
      });
      if (response.isError) throw new Error("superlog_tool_failed");
      if (response.structuredContent !== undefined)
        return response.structuredContent;
      const content = Array.isArray(response.content) ? response.content : [];
      const parts = content.flatMap((part) =>
        part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : [],
      );
      const joined = parts.join("").slice(0, MAX_RESULT_BYTES);
      try {
        return JSON.parse(joined) as unknown;
      } catch {
        return joined;
      }
    };
    return await run(tools, call);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await client.close().catch(() => undefined);
  }
}

function findTool(
  tools: McpTool[],
  name: string,
  pattern: RegExp,
): McpTool | undefined {
  return (
    tools.find((tool) => tool.name === name) ??
    tools.find((tool) => pattern.test(tool.name))
  );
}

export async function fetchSuperlogSummary(
  config: unknown,
  now = Date.now(),
): Promise<SuperlogSummary> {
  const parsed = superlogConfigSchema.safeParse(config);
  if (!parsed.success) throw new Error("superlog_invalid_config");
  return withSuperlog(parsed.data.token, async (tools, call) => {
    const search = findTool(tools, "search_incidents", /incident/iu);
    if (!search) throw new Error("superlog_tool_missing");
    const alertsTool = findTool(tools, "list_alerts", /alert/iu);
    const logsTool = findTool(tools, "query_logs", /logs?$/iu);
    const since = new Date(now - 86_400_000).toISOString();
    const [open, recent, alerts, errors] = await Promise.all([
      call(search, { status: "open", limit: 100 }),
      call(search, { status: "all", since, limit: 200 }),
      alertsTool ? call(alertsTool, {}) : Promise.resolve(null),
      logsTool
        ? call(logsTool, {
            severity: "ERROR",
            range: { since: "now() - INTERVAL 24 HOUR" },
            limit: 500,
          })
        : Promise.resolve(null),
    ]);
    return summarizeSuperlog({ open, recent, alerts, errors, now });
  });
}

function scopeWhere(scope: StripeConnectionScope) {
  return and(
    eq(CockpitConnectionTable.provider, "superlog"),
    scope.teamId
      ? eq(CockpitConnectionTable.teamId, scope.teamId)
      : and(
          eq(CockpitConnectionTable.userId, scope.userId),
          isNull(CockpitConnectionTable.teamId),
        ),
  );
}

function openConfig(value: string | null): Record<string, unknown> | null {
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

export async function getSuperlogConnectionStatus(
  scope: StripeConnectionScope,
) {
  const [row] = await pgDb
    .select({
      configEncrypted: CockpitConnectionTable.configEncrypted,
      lastTestedAt: CockpitConnectionTable.lastTestedAt,
      lastTestOk: CockpitConnectionTable.lastTestOk,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(scopeWhere(scope))
    .limit(1);
  if (!row)
    return {
      connected: false,
      tokenSet: false,
      lastTestedAt: null,
      lastTestOk: null,
      updatedAt: null,
    };
  const config = openConfig(row.configEncrypted);
  const valid = config ? superlogConfigSchema.safeParse(config).success : false;
  return {
    connected: true,
    tokenSet: valid,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveSuperlogConnection(
  scope: StripeConnectionScope,
  input: SuperlogConfigInput,
) {
  if (!isEncryptionAvailable()) throw new Error("encryption_unavailable");
  const [existing] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(scopeWhere(scope))
    .limit(1);
  const previous = existing ? openConfig(existing.configEncrypted) : null;
  const oldToken =
    previous && typeof previous.token === "string" ? previous.token : "";
  const parsed = superlogConfigSchema.safeParse({
    token: input.token?.trim() || oldToken,
  });
  if (!parsed.success) throw new Error("invalid_config");
  const configEncrypted = encrypt(JSON.stringify(parsed.data));
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
      provider: "superlog",
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
  return getSuperlogConnectionStatus(scope);
}

export async function testStoredSuperlogConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(scopeWhere(scope))
    .limit(1);
  if (!row) return false;
  const config = openConfig(row.configEncrypted);
  let ok = false;
  if (config && superlogConfigSchema.safeParse(config).success) {
    try {
      await fetchSuperlogSummary(config);
      ok = true;
    } catch {
      ok = false;
    }
  }
  await pgDb
    .update(CockpitConnectionTable)
    .set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() })
    .where(and(eq(CockpitConnectionTable.id, row.id), scopeWhere(scope)));
  return ok;
}

export async function loadSuperlogSummary(
  scope: StripeConnectionScope,
): Promise<SuperlogSummary | null> {
  const [row] = await pgDb
    .select({
      configEncrypted: CockpitConnectionTable.configEncrypted,
      id: CockpitConnectionTable.id,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(scopeWhere(scope))
    .limit(1);
  if (!row) return null;
  const config = openConfig(row.configEncrypted);
  if (!config || !superlogConfigSchema.safeParse(config).success)
    throw new Error("superlog_invalid_config");
  return fetchSuperlogSummary(config);
}

export async function removeSuperlogConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const deleted = await pgDb
    .delete(CockpitConnectionTable)
    .where(scopeWhere(scope))
    .returning({ id: CockpitConnectionTable.id });
  return deleted.length > 0;
}

export function publicSuperlogError(error: unknown): string {
  if (error instanceof Error && error.message === "superlog_wrong_key_type")
    return "Use a Superlog personal access token (superlog_pat_), not an ingest or management key.";
  if (error instanceof Error && error.message === "superlog_tool_missing")
    return "Superlog did not expose the required incident search tool.";
  return "Unable to load Superlog incident data. Check the personal access token and try again.";
}
