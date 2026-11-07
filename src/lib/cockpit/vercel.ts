import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { serverCache } from "lib/cache";
import { pgDb } from "lib/db/pg/db.pg";
import { CockpitConnectionTable } from "lib/db/pg/schema.pg";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";
import { z } from "zod";
import type { StripeConnectionScope } from "./stripe";

const VERCEL_API = "https://api.vercel.com";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TEAMS = 20;
const MAX_PROJECTS = 6;
const MAX_DEPLOYMENTS = 20;
const SCOPE_TTL_MS = 60 * 60_000;
const DAY_MS = 86_400_000;

const projectSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,32}$/),
    projectId: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(32),
  })
  .strict();

export const vercelConfigSchema = z
  .object({
    token: z.string().trim().min(1).max(10_000),
    teamId: z.string().trim().max(100).optional().or(z.literal("")),
    projects: z.array(projectSchema).min(1).max(MAX_PROJECTS),
  })
  .strict()
  .superRefine((config, context) => {
    const keys = config.projects.map((project) => project.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "project keys must be unique",
      });
    }
  });

export const vercelSubmitSchema = z
  .object({
    token: z.string().trim().max(10_000).optional(),
    teamId: z.string().trim().max(100).optional().or(z.literal("")),
    projects: z.array(projectSchema).min(1).max(MAX_PROJECTS),
  })
  .strict()
  .superRefine((config, context) => {
    const keys = config.projects.map((project) => project.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "project keys must be unique",
      });
    }
  });

export type VercelConfig = z.infer<typeof vercelConfigSchema>;
export type VercelConfigInput = z.infer<typeof vercelSubmitSchema>;
export type DeployState =
  | "READY"
  | "ERROR"
  | "BUILDING"
  | "QUEUED"
  | "CANCELED"
  | "INITIALIZING"
  | "UNKNOWN";
export type VercelProjectSnapshot = {
  key: string;
  label: string;
  deploy: null | {
    id: string;
    state: DeployState;
    createdAt: string;
    url: string | null;
    failedLast7d: number;
  };
  error: "unauthorized" | "unavailable" | null;
};
export type VercelSnapshot = {
  generatedAt: string;
  projects: VercelProjectSnapshot[];
};

class VercelProviderError extends Error {
  constructor(
    readonly status: number | null,
    readonly code:
      | "unauthorized"
      | "not_found"
      | "unavailable"
      | "invalid_response",
  ) {
    super(code);
    this.name = "VercelProviderError";
  }
}

async function readJsonBounded<T>(response: Response): Promise<T> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new VercelProviderError(response.status, "invalid_response");
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
        throw new VercelProviderError(response.status, "invalid_response");
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
  } catch {
    throw new VercelProviderError(response.status, "invalid_response");
  } finally {
    reader.releaseLock();
  }
}

async function getJson<T>(
  path: string,
  token: string,
  signal: AbortSignal,
): Promise<T> {
  const url = new URL(path, VERCEL_API);
  if (url.origin !== VERCEL_API || !path.startsWith("/"))
    throw new VercelProviderError(null, "unavailable");
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new VercelProviderError(null, "unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const code =
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : response.status === 404
          ? "not_found"
          : "unavailable";
    throw new VercelProviderError(response.status, code);
  }
  return readJsonBounded<T>(response);
}

type TeamScope = { teamId?: string; slug?: string };
type VercelDeployment = {
  uid: string;
  created: number;
  state?: string;
  readyState?: string;
  url?: string;
};

function scopeQuery(scope: TeamScope): string {
  const params = new URLSearchParams();
  if (scope.teamId) params.set("teamId", scope.teamId);
  else if (scope.slug) params.set("slug", scope.slug);
  return params.toString();
}

async function resolveTeamScope(
  config: VercelConfig,
  token: string,
  signal: AbortSignal,
  scope: StripeConnectionScope,
  connectionId?: string,
  version?: string,
): Promise<TeamScope> {
  const supplied = config.teamId?.trim();
  if (supplied)
    return supplied.startsWith("team_")
      ? { teamId: supplied }
      : { slug: supplied };
  const cacheKey = connectionId
    ? `cockpit:vercel-team:${scope.teamId ?? `user:${scope.userId}`}:${connectionId}:${version ?? ""}`
    : null;
  if (cacheKey) {
    const cached = await serverCache
      .get<TeamScope>(cacheKey)
      .catch(() => undefined);
    if (cached) return cached;
  }

  let teamIds: string[] = [];
  try {
    const result = await getJson<{ teams?: Array<{ id?: unknown }> }>(
      "/v2/teams?limit=20",
      token,
      signal,
    );
    teamIds = [
      ...new Set(
        (result.teams ?? [])
          .map((team) => team.id)
          .filter(
            (id): id is string =>
              typeof id === "string" && /^team_[A-Za-z0-9_-]{1,100}$/.test(id),
          ),
      ),
    ].slice(0, MAX_TEAMS);
  } catch {
    // Project-scoped tokens may not list teams; try the token's own scope.
  }

  const projectId = encodeURIComponent(config.projects[0].projectId);
  const candidates: TeamScope[] = [
    {},
    ...teamIds.map((teamId) => ({ teamId })),
  ];
  for (const candidate of candidates) {
    const query = scopeQuery(candidate);
    const path = `/v9/projects/${projectId}${query ? `?${query}` : ""}`;
    try {
      await getJson(path, token, signal);
      if (cacheKey)
        await serverCache
          .set(cacheKey, candidate, SCOPE_TTL_MS)
          .catch(() => undefined);
      return candidate;
    } catch (error) {
      if (error instanceof VercelProviderError && error.code === "unauthorized")
        throw error;
    }
  }
  // Preserve reference behavior: deployments endpoint gets one final chance
  // under the token's own scope and returns its generic failure if unavailable.
  return {};
}

export function deploymentSummary(rows: VercelDeployment[], nowMs: number) {
  const latest = rows[0];
  if (!latest || !latest.uid || !Number.isFinite(latest.created)) return null;
  const rawState = (latest.state ?? latest.readyState ?? "").toUpperCase();
  const allowed = [
    "READY",
    "ERROR",
    "BUILDING",
    "QUEUED",
    "CANCELED",
    "INITIALIZING",
  ];
  const safeUrl =
    typeof latest.url === "string" &&
    /^[a-z0-9][a-z0-9.-]{0,252}$/i.test(latest.url)
      ? `https://${latest.url}`
      : null;
  return {
    id: latest.uid.slice(0, 128),
    state: (allowed.includes(rawState) ? rawState : "UNKNOWN") as DeployState,
    createdAt: new Date(latest.created).toISOString(),
    url: safeUrl,
    failedLast7d: rows
      .slice(0, MAX_DEPLOYMENTS)
      .filter(
        (row) =>
          row.created >= nowMs - 7 * DAY_MS &&
          (row.state ?? row.readyState ?? "").toUpperCase() === "ERROR",
      ).length,
  };
}

async function deployments(
  teamScope: TeamScope,
  projectId: string,
  token: string,
  signal: AbortSignal,
): Promise<VercelDeployment[]> {
  const params = new URLSearchParams({
    projectId,
    target: "production",
    limit: String(MAX_DEPLOYMENTS),
  });
  const scope = scopeQuery(teamScope);
  for (const [name, value] of new URLSearchParams(scope))
    params.set(name, value);
  const response = await getJson<{ deployments?: VercelDeployment[] }>(
    `/v6/deployments?${params}`,
    token,
    signal,
  );
  if (!Array.isArray(response.deployments))
    throw new VercelProviderError(null, "invalid_response");
  return response.deployments.slice(0, MAX_DEPLOYMENTS);
}

export async function getVercelSnapshot(
  configInput: unknown,
  scope: StripeConnectionScope,
  options: { connectionId?: string; version?: string; nowMs?: number } = {},
): Promise<VercelSnapshot> {
  const parsed = vercelConfigSchema.safeParse(configInput);
  if (!parsed.success) throw new VercelProviderError(null, "invalid_response");
  const config = parsed.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const nowMs = options.nowMs ?? Date.now();
  try {
    const teamScope = await resolveTeamScope(
      config,
      config.token,
      controller.signal,
      scope,
      options.connectionId,
      options.version,
    );
    const projects = await Promise.all(
      config.projects.map(async (project): Promise<VercelProjectSnapshot> => {
        try {
          const list = await deployments(
            teamScope,
            project.projectId,
            config.token,
            controller.signal,
          );
          const deploy = deploymentSummary(list, nowMs);
          return {
            key: project.key,
            label: project.label,
            deploy,
            error: deploy || list.length === 0 ? null : "unavailable",
          };
        } catch (error) {
          return {
            key: project.key,
            label: project.label,
            deploy: null,
            error:
              error instanceof VercelProviderError &&
              error.code === "unauthorized"
                ? "unauthorized"
                : "unavailable",
          };
        }
      }),
    );
    if (
      projects.length > 0 &&
      projects.every((project) => project.error === "unauthorized")
    )
      throw new VercelProviderError(403, "unauthorized");
    return { generatedAt: new Date(nowMs).toISOString(), projects };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeVercel(
  config: unknown,
  scope: StripeConnectionScope,
): Promise<boolean> {
  try {
    const snapshot = await getVercelSnapshot(config, scope);
    return (
      snapshot.projects.length > 0 &&
      snapshot.projects.some((project) => project.error === null)
    );
  } catch {
    return false;
  }
}

const dbScopeWhere = (scope: StripeConnectionScope) =>
  scope.teamId
    ? eq(CockpitConnectionTable.teamId, scope.teamId)
    : and(
        eq(CockpitConnectionTable.userId, scope.userId),
        isNull(CockpitConnectionTable.teamId),
      );

function openConfig(encrypted: string | null): Record<string, unknown> | null {
  if (!encrypted) return null;
  try {
    const raw = JSON.parse(decrypt(encrypted)) as unknown;
    return typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function getVercelConnectionStatus(scope: StripeConnectionScope) {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      teamId: CockpitConnectionTable.teamId,
      configEncrypted: CockpitConnectionTable.configEncrypted,
      lastTestedAt: CockpitConnectionTable.lastTestedAt,
      lastTestOk: CockpitConnectionTable.lastTestOk,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(
      and(dbScopeWhere(scope), eq(CockpitConnectionTable.provider, "vercel")),
    )
    .limit(1);
  if (!row)
    return {
      connected: false,
      config: null,
      lastTestedAt: null,
      lastTestOk: null,
      updatedAt: null,
    };
  const config = openConfig(row.configEncrypted);
  const parsed = config ? vercelConfigSchema.safeParse(config) : null;
  return {
    connected: true,
    config: parsed?.success
      ? {
          teamId: parsed.data.teamId ?? "",
          projects: parsed.data.projects,
          tokenSet: true,
        }
      : null,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveVercelConnection(
  scope: StripeConnectionScope,
  input: VercelConfigInput,
) {
  if (!isEncryptionAvailable()) throw new Error("encryption_unavailable");
  const [existing] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(
      and(dbScopeWhere(scope), eq(CockpitConnectionTable.provider, "vercel")),
    )
    .limit(1);
  const oldConfig = existing ? openConfig(existing.configEncrypted) : null;
  const token =
    input.token?.trim() ||
    (oldConfig && typeof oldConfig.token === "string" ? oldConfig.token : "");
  const parsed = vercelConfigSchema.safeParse({ ...input, token });
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
      provider: "vercel",
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
  return getVercelConnectionStatus(scope);
}

export async function testStoredVercelConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(
      and(dbScopeWhere(scope), eq(CockpitConnectionTable.provider, "vercel")),
    )
    .limit(1);
  if (!row) return false;
  const config = openConfig(row.configEncrypted);
  const ok = config ? await probeVercel(config, scope) : false;
  await pgDb
    .update(CockpitConnectionTable)
    .set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() })
    .where(and(eq(CockpitConnectionTable.id, row.id), dbScopeWhere(scope)));
  return ok;
}

export async function loadVercelSnapshot(
  scope: StripeConnectionScope,
): Promise<VercelSnapshot | null> {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      configEncrypted: CockpitConnectionTable.configEncrypted,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(
      and(dbScopeWhere(scope), eq(CockpitConnectionTable.provider, "vercel")),
    )
    .limit(1);
  if (!row) return null;
  const config = openConfig(row.configEncrypted);
  if (!config) throw new VercelProviderError(null, "invalid_response");
  return getVercelSnapshot(config, scope, {
    connectionId: row.id,
    version: row.updatedAt.toISOString(),
  });
}

export async function removeVercelConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const deleted = await pgDb
    .delete(CockpitConnectionTable)
    .where(
      and(dbScopeWhere(scope), eq(CockpitConnectionTable.provider, "vercel")),
    )
    .returning({ id: CockpitConnectionTable.id });
  return deleted.length > 0;
}

export function publicVercelError(error: unknown): string {
  return error instanceof VercelProviderError && error.code === "unauthorized"
    ? "Vercel rejected this token or scope. Check its read permissions and project access."
    : "Unable to load Vercel deployment data.";
}
