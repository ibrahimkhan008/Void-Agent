import "server-only";

import { getSession } from "auth/server";
import {
  customModelProvider,
  invalidateDynamicModelsCache,
} from "lib/ai/models";
import { requireAdminPermission } from "lib/auth/permissions";
import type { DynamicProviderEntry } from "lib/db/pg/repositories/site-config-repository.pg";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

// Sections the admin settings UI may read and write. Keys without a ported
// settings page (branding, email, oauth, mcp, chat, community) are
// intentionally absent until their runtime consumers exist in staging.
const CONFIG_KEYS = [
  "models",
  "tools",
  "canvas",
  "artifacts",
  "general",
  "security",
] as const;

const MAX_BODY_BYTES = 128 * 1024;

const SECRET_REF_PREFIX = "dyn_";

const mutationSchema = z
  .object({
    key: z.enum(CONFIG_KEYS),
    settings: z.record(z.string(), z.unknown()),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

// ---------------------------------------------------------------------------
// Defaults. These mirror the destination admin console's default config so the
// merged response always has real objects for the UI to spread into.
// ---------------------------------------------------------------------------

function buildDefaultToolsConfig() {
  return {
    categories: {
      Visualization: { enabled: true, tools: {} },
      WebSearch: { enabled: true, tools: {} },
      Browser: { enabled: true, tools: {} },
      Code: { enabled: true, tools: {} },
      Video: { enabled: true, tools: {} },
      Artifacts: { enabled: true, tools: {} },
      Canvas: { enabled: true, tools: {} },
      Connectors: { enabled: true, tools: {} },
      Memory: { enabled: true, tools: {} },
    },
    apiKeys: {
      exa: !!process.env.EXA_API_KEY,
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      youtube: !!process.env.YOUTUBE_API_KEY,
      supadata: !!process.env.SUPADATA_API_KEY,
      konvo: !!process.env.KONVO_AI_API,
      dodo_api_key: !!process.env.DODO_PAYMENTS_API_KEY,
      dodo_webhook_secret: !!process.env.DODO_WEBHOOK_SECRET,
    },
  } as Record<string, unknown>;
}

function buildDefaultCanvasConfig() {
  return {
    model: "Claude Opus 4.6",
    defaultSlideCount: 10,
    pptxExportEnabled: true,
  } as Record<string, unknown>;
}

function buildDefaultArtifactsConfig() {
  return {
    model: "Gemini 3 Flash",
    enabledTypes: ["html", "react", "slides"],
  } as Record<string, unknown>;
}

function buildDefaultGeneralConfig() {
  return {
    appName: "Flare AI",
    appLogoUrl: "/flare-logo-512.webp",
    defaultToolChoice: "auto",
    freeTierDailyTokenLimit: 150_000,
    freeTierEnabled: true,
    rateLimitPerUser: 60,
    rateLimitPerIP: 120,
    featureFlags: {
      newCanvas: true,
      voiceChat: true,
      communityPage: true,
      experimentalAgents: false,
    },
  } as Record<string, unknown>;
}

function buildDefaultSecurityConfig() {
  return {
    sessionExpiresInSeconds: 60 * 60 * 24,
    sessionUpdateAgeSeconds: 60 * 60 * 24,
    sessionCookieCacheMaxAgeSeconds: 60 * 60 * 24,
    ipHeaderPriority: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
    geoHeaderPriority: ["cf-ipcountry", "cf-ipcity", "x-vercel-ip-country"],
    securityEventsLookback: 50,
    headers: {
      xFrameOptions: "SAMEORIGIN",
      contentSecurityPolicy: "frame-ancestors 'self';",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
      permissionsPolicy: "camera=(), microphone=(self), geolocation=()",
    },
  } as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Models section assembly. Built-in providers come from the runtime catalog
// (which already includes hydrated dynamic providers); DB overrides are then
// merged per provider so admin toggles survive redeployments.
// ---------------------------------------------------------------------------

function isSecretConfigured(
  providerId: string,
  provider: DynamicProviderEntry & { apiKey?: unknown },
  ref: string,
  secrets: Record<string, unknown>,
): boolean {
  const envConfigured =
    typeof provider.apiKeyRef === "string" &&
    provider.apiKeyRef !== "" &&
    typeof process.env[provider.apiKeyRef] === "string" &&
    process.env[provider.apiKeyRef] !== "";
  const managedRef = `${SECRET_REF_PREFIX}${providerId}`;
  return (
    envConfigured ||
    (typeof secrets[ref] === "string" && secrets[ref] !== "") ||
    (typeof secrets[managedRef] === "string" && secrets[managedRef] !== "") ||
    (typeof provider.apiKey === "string" && provider.apiKey !== "")
  );
}

function buildModelsConfig(
  dbModels: Record<string, unknown>,
  toolsSecrets: Record<string, unknown>,
) {
  const dbProviders = (dbModels.providers ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const dbDynamicProviders = (dbModels.dynamicProviders ?? {}) as Record<
    string,
    DynamicProviderEntry & { apiKey?: unknown }
  >;

  const mergedProviders: Record<string, unknown> = {};
  const dynamicIds = new Set(Object.keys(dbDynamicProviders));

  for (const entry of customModelProviderModelsInfo()) {
    // A provider id managed as a dynamic provider in the DB is rendered from
    // the DB record below instead of the runtime catalog row.
    if (dynamicIds.has(entry.provider)) continue;
    const dbInfo = dbProviders[entry.provider] ?? {};
    const provider: Record<string, unknown> = {
      enabled: true,
      apiKeyConfigured: entry.hasAPIKey,
      defaultModel: entry.models[0]?.name ?? "",
      fallbackChain: [],
      isDynamic: false,
      ...dbInfo,
    };
    // Migrate the legacy "provider/model" fallback string to the chain array.
    if (provider.fallbackModel && !provider.fallbackChain) {
      const parts = String(provider.fallbackModel).split("/");
      provider.fallbackChain =
        parts.length >= 2 && parts[0] && parts[1]
          ? [{ provider: parts[0], model: parts.slice(1).join("/") }]
          : [];
      delete provider.fallbackModel;
    }
    mergedProviders[entry.provider] = provider;
  }

  const dynamicProviders: Record<string, unknown> = {};
  for (const [id, provider] of Object.entries(dbDynamicProviders)) {
    const ref =
      typeof provider.apiKeyRef === "string" && provider.apiKeyRef
        ? provider.apiKeyRef
        : `${SECRET_REF_PREFIX}${id}`;
    dynamicProviders[id] = {
      name: typeof provider.name === "string" ? provider.name : id,
      baseURL: typeof provider.baseURL === "string" ? provider.baseURL : "",
      // A key *reference* name, never the secret itself.
      apiKeyRef: ref,
      apiKeyConfigured: isSecretConfigured(id, provider, ref, toolsSecrets),
      enabled: provider.enabled === true,
      models: Array.isArray(provider.models)
        ? provider.models
            .map((model) =>
              typeof model === "string"
                ? model
                : model && typeof model === "object" && "name" in model
                  ? String((model as { name: unknown }).name)
                  : "",
            )
            .filter((name) => name.length > 0)
        : [],
      addedAt: typeof provider.addedAt === "string" ? provider.addedAt : "",
    };
    // Dynamic providers are not rendered twice in the built-in section.
    delete mergedProviders[id];
  }

  const modelsConfig: Record<string, unknown> = {
    providers: mergedProviders,
    dynamicProviders,
  };
  if (typeof dbModels.defaultModel === "string") {
    modelsConfig.defaultModel = dbModels.defaultModel;
  }
  if (typeof dbModels.fallbackModel === "string") {
    modelsConfig.fallbackModel = dbModels.fallbackModel;
  }
  if (dbModels.globalFallback !== undefined) {
    modelsConfig.globalFallback = dbModels.globalFallback;
  }
  return modelsConfig;
}

/**
 * Reads the runtime model catalog. Includes built-in providers plus any
 * dynamic providers hydrated from the site config at runtime.
 */
function customModelProviderModelsInfo() {
  return customModelProvider.modelsInfo;
}

// ---------------------------------------------------------------------------
// Secrets hygiene. apiKeysSecrets values are encrypted ciphertexts and are
// never returned to a client; the client also may never write them.
// ---------------------------------------------------------------------------

function stripSecrets<T extends Record<string, unknown>>(settings: T) {
  const { apiKeysSecrets: _omit, ...rest } = settings;
  return rest;
}

export async function GET() {
  try {
    await requireAdminPermission("access admin configuration");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const db = await siteConfigRepository.getAll();
    const dbModels = (db.models ?? {}) as Record<string, unknown>;
    const dbTools = (db.tools ?? {}) as Record<string, unknown>;
    const secrets = (dbTools.apiKeysSecrets ?? {}) as Record<string, unknown>;

    const config = {
      models: buildModelsConfig(dbModels, secrets),
      tools: {
        ...buildDefaultToolsConfig(),
        ...stripSecrets(dbTools),
        // Presence booleans only; the encrypted values stay server-side.
        apiKeys: {
          ...(buildDefaultToolsConfig().apiKeys as Record<string, boolean>),
          ...((dbTools.apiKeys ?? {}) as Record<string, boolean>),
        },
        dynamicTools: dbTools.dynamicTools ?? {},
      },
      canvas: {
        ...buildDefaultCanvasConfig(),
        ...((db.canvas ?? {}) as object),
      },
      artifacts: {
        ...buildDefaultArtifactsConfig(),
        ...((db.artifacts ?? {}) as object),
      },
      general: {
        ...buildDefaultGeneralConfig(),
        ...((db.general ?? {}) as object),
      },
      security: {
        ...buildDefaultSecurityConfig(),
        ...((db.security ?? {}) as object),
      },
    };
    return json({ success: true, config });
  } catch (error) {
    console.error("[config/GET] error:", error);
    return json({ success: false, error: "Internal server error" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission("update admin configuration");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasSameOrigin(request)) {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const rate = await checkApiRateLimit({
      kind: "admin-config-write",
      id: userId,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return json({ success: false, error: "Too many requests" }, 429);
    }
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }
  if (!bytes) return json({ success: false, error: "Request too large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ success: false, error: "Invalid config section" }, 400);
  }

  const { key } = parsed.data;
  // Shallow copy; deep contents stay untyped JSON validated per key below.
  let incoming: Record<string, unknown> = { ...parsed.data.settings };
  // Clients can never create or overwrite encrypted secrets through this route.
  delete incoming.apiKeysSecrets;

  try {
    const existing =
      (await siteConfigRepository.getConfig(key)) ??
      ({} as Record<string, unknown>);

    if (key === "models") {
      // Older model-settings clients submit only the fields they understand.
      // Merge section fields so they cannot erase provider configuration
      // maintained by another admin workflow. Key-level spreads (providers,
      // dynamicProviders) still replace wholesale so removals persist.
      incoming = { ...(existing as object), ...incoming };
      const existingDynamic = (existing.dynamicProviders ?? {}) as Record<
        string,
        DynamicProviderEntry
      >;
      const incomingDynamic = (incoming.dynamicProviders ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      for (const [id, entry] of Object.entries(incomingDynamic)) {
        const ref = existingDynamic[id]?.apiKeyRef;
        if (
          typeof entry.apiKeyRef !== "string" &&
          typeof ref === "string" &&
          ref
        ) {
          entry.apiKeyRef = ref;
        }
        delete entry.apiKey;
      }
      await siteConfigRepository.upsert(key, incoming, userId);
      invalidateDynamicModelsCache();
      return json({ success: true });
    }

    if (key === "tools") {
      incoming = { ...(existing as object), ...incoming };
      // Secrets live in apiKeysSecrets and are managed exclusively by
      // /api/admin/api-keys and the dynamic provider routes. Whatever the
      // client sent, the stored ciphertexts are preserved as-is.
      incoming.apiKeysSecrets = existing.apiKeysSecrets ?? {};
      await siteConfigRepository.upsert(key, incoming, userId);
      return json({ success: true });
    }

    await siteConfigRepository.upsert(key, incoming, userId);
    return json({ success: true });
  } catch (error) {
    console.error("[config/POST] upsert error:", error);
    return json({ success: false, error: "Failed to save configuration" }, 500);
  }
}
