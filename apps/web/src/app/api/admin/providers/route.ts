import "server-only";

import { getSession } from "auth/server";
import { invalidateDynamicModelsCache } from "lib/ai/models";
import { customModelProvider } from "lib/ai/models";
import { requireAdminPermission } from "lib/auth/permissions";
import type { DynamicProviderEntry } from "lib/db/pg/repositories/site-config-repository.pg";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { encrypt, isEncryptionAvailable } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 16 * 1024;
const SECRET_PREFIX = "dyn_";
const providerIdSchema = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

const mutationSchema = z
  .object({
    id: z.string().trim().max(100).optional(),
    name: z.string().trim().min(1).max(100),
    baseURL: z.string().trim().min(1).max(2_048),
    apiKey: z.string().max(4_096).optional(),
    models: z.array(z.unknown()).max(100).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

function providerSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .slice(0, 64);
}

function normalizeBaseURL(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function normalizeModels(
  value: unknown,
): { name: string; apiModelId: string }[] {
  if (!Array.isArray(value)) return [];
  const models = new Map<string, { name: string; apiModelId: string }>();
  for (const item of value) {
    const name =
      typeof item === "string"
        ? item.trim()
        : item && typeof item === "object" && "name" in item
          ? String(item.name).trim()
          : "";
    const apiModelId =
      item && typeof item === "object" && "apiModelId" in item
        ? String(item.apiModelId).trim()
        : item && typeof item === "object" && "id" in item
          ? String(item.id).trim()
          : name;
    if (!name || !apiModelId || name.length > 200 || apiModelId.length > 200) {
      continue;
    }
    models.set(name, { name, apiModelId });
    if (models.size === 100) break;
  }
  return [...models.values()];
}

async function authorizeMutation(request: Request) {
  try {
    await requireAdminPermission("manage model providers");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasSameOrigin(request)) {
    return json({ success: false, error: "Forbidden" }, 403);
  }
  const session = await getSession();
  if (!session?.user.id) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  try {
    const rate = await checkApiRateLimit({
      kind: "admin-dynamic-provider-mutation",
      id: session.user.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return json({ success: false, error: "Too many requests" }, 429);
    }
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }
  return null;
}

export async function GET() {
  try {
    await requireAdminPermission("view model providers");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const [modelConfig, toolsConfig] = await Promise.all([
      siteConfigRepository.getConfig("models"),
      siteConfigRepository.getConfig("tools").catch(() => null),
    ]);
    const configured = (modelConfig?.dynamicProviders ?? {}) as Record<
      string,
      DynamicProviderEntry & { apiKey?: string }
    >;
    const secrets = (toolsConfig?.apiKeysSecrets ?? {}) as Record<
      string,
      unknown
    >;
    const providers = Object.entries(configured).map(([id, provider]) => {
      const ref =
        typeof provider.apiKeyRef === "string"
          ? provider.apiKeyRef
          : `${SECRET_PREFIX}${id}`;
      const models = normalizeModels(provider.models);
      return {
        id,
        name: typeof provider.name === "string" ? provider.name : id,
        baseURL: typeof provider.baseURL === "string" ? provider.baseURL : "",
        apiKeyConfigured:
          (typeof provider.apiKeyRef === "string" &&
            typeof process.env[provider.apiKeyRef] === "string" &&
            process.env[provider.apiKeyRef] !== "") ||
          (typeof secrets[ref] === "string" && secrets[ref] !== "") ||
          (typeof secrets[`${SECRET_PREFIX}${id}`] === "string" &&
            secrets[`${SECRET_PREFIX}${id}`] !== "") ||
          (typeof provider.apiKey === "string" && provider.apiKey !== ""),
        models: models.map((model) => model.name),
        enabled: provider.enabled === true,
        addedAt: typeof provider.addedAt === "string" ? provider.addedAt : "",
      };
    });
    return json({ success: true, providers });
  } catch {
    return json({ success: false, error: "Failed to load providers" }, 500);
  }
}

export async function POST(request: Request) {
  const denied = await authorizeMutation(request);
  if (denied) return denied;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ success: false, error: "Request too large" }, 413);
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
    return json({ success: false, error: "Invalid JSON" }, 400);
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { success: false, error: "Invalid provider configuration" },
      400,
    );
  }

  const input = parsed.data;
  const id = providerSlug(input.id || input.name);
  if (!id || !providerIdSchema.test(id)) {
    return json({ success: false, error: "Invalid provider ID" }, 400);
  }
  const baseURL = normalizeBaseURL(input.baseURL);
  if (!baseURL) {
    return json(
      { success: false, error: "Provider endpoint must be a valid HTTPS URL" },
      400,
    );
  }

  try {
    const current = await siteConfigRepository.getConfig("models");
    const existing = (current?.dynamicProviders ?? {}) as Record<
      string,
      DynamicProviderEntry & { apiKey?: string }
    >;
    const oldProvider = existing[id];
    if (
      !oldProvider &&
      customModelProvider.modelsInfo.some(
        (entry) => entry.provider.toLowerCase() === id,
      )
    ) {
      return json({ success: false, error: "Provider ID is reserved" }, 409);
    }

    const apiKey = input.apiKey?.trim();
    if (apiKey && !isEncryptionAvailable()) {
      return json(
        { success: false, error: "Encryption is not configured" },
        503,
      );
    }

    const tools = await siteConfigRepository.getConfig("tools");
    const secrets = {
      ...((tools?.apiKeysSecrets ?? {}) as Record<string, string>),
    };
    let apiKeyRef =
      typeof oldProvider?.apiKeyRef === "string" && oldProvider.apiKeyRef
        ? oldProvider.apiKeyRef
        : `${SECRET_PREFIX}${id}`;
    if (apiKey) {
      apiKeyRef = `${SECRET_PREFIX}${id}`;
      secrets[apiKeyRef] = encrypt(apiKey);
    } else if (
      !secrets[`${SECRET_PREFIX}${id}`] &&
      typeof oldProvider?.apiKey === "string" &&
      oldProvider.apiKey
    ) {
      // Older destination records kept the ciphertext inside the model row.
      // Move that opaque encrypted value to the shared secret map without
      // returning or decrypting it in this route.
      apiKeyRef = `${SECRET_PREFIX}${id}`;
      secrets[apiKeyRef] = oldProvider.apiKey;
    }

    if (apiKeyRef.startsWith(SECRET_PREFIX) && secrets[apiKeyRef]) {
      await siteConfigRepository.upsert("tools", {
        ...(tools ?? {}),
        apiKeysSecrets: secrets,
      });
    }

    const suppliedModels =
      input.models === undefined
        ? normalizeModels(oldProvider?.models)
        : normalizeModels(input.models);
    const provider = {
      name: input.name,
      baseURL,
      apiKeyRef:
        apiKeyRef.startsWith(SECRET_PREFIX) && secrets[apiKeyRef]
          ? apiKeyRef
          : typeof oldProvider?.apiKeyRef === "string"
            ? oldProvider.apiKeyRef
            : "",
      models: suppliedModels,
      enabled: input.enabled ?? oldProvider?.enabled === true,
      addedAt:
        typeof oldProvider?.addedAt === "string"
          ? oldProvider.addedAt
          : new Date().toISOString(),
    };
    await siteConfigRepository.upsert("models", {
      ...(current ?? {}),
      dynamicProviders: { ...existing, [id]: provider as DynamicProviderEntry },
    });

    invalidateDynamicModelsCache();
    return json({ success: true, id });
  } catch {
    return json({ success: false, error: "Failed to save provider" }, 500);
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeMutation(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !providerIdSchema.test(id)) {
    return json({ success: false, error: "Invalid provider ID" }, 400);
  }

  try {
    const [current, tools] = await Promise.all([
      siteConfigRepository.getConfig("models"),
      siteConfigRepository.getConfig("tools"),
    ]);
    const existing = (current?.dynamicProviders ?? {}) as Record<
      string,
      DynamicProviderEntry & { apiKey?: string }
    >;
    if (!existing[id]) {
      return json({ success: false, error: "Provider not found" }, 404);
    }

    const updated = { ...existing };
    delete updated[id];
    await siteConfigRepository.upsert("models", {
      ...(current ?? {}),
      dynamicProviders: updated as Record<string, DynamicProviderEntry>,
    });

    const secrets = {
      ...((tools?.apiKeysSecrets ?? {}) as Record<string, string>),
    };
    const refsStillInUse = new Set(
      Object.entries(updated)
        .map(([, provider]) => provider.apiKeyRef)
        .filter((ref): ref is string => typeof ref === "string"),
    );
    const managedRef = `${SECRET_PREFIX}${id}`;
    if (!refsStillInUse.has(managedRef)) {
      delete secrets[managedRef];
    }
    await siteConfigRepository.upsert("tools", {
      ...(tools ?? {}),
      apiKeysSecrets: secrets,
    });
    invalidateDynamicModelsCache();
    return json({ success: true });
  } catch {
    return json({ success: false, error: "Failed to delete provider" }, 500);
  }
}
