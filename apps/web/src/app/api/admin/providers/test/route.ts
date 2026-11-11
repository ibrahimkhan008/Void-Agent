import "server-only";

import { getSession } from "auth/server";
import {
  ProviderDiscoveryTimeoutError,
  requestProviderDiscovery,
} from "lib/admin/provider-discovery";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { decrypt } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { UrlBlockedError } from "lib/webhooks/url-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 2 * 1024;
const requestSchema = z
  .object({ provider: z.string().trim().min(1).max(64) })
  .strict();

type ProviderConfig = { baseURL: string; authKey: string; header: string };
const staticProviders: Record<string, ProviderConfig> = {
  flare: {
    baseURL: "https://api.flare-sh.tech/v1",
    authKey: process.env.FLARE_API_KEY || process.env.KORE_API_KEY || "",
    header: "Authorization",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    authKey: process.env.GROQ_API_KEY || "",
    header: "Authorization",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    authKey: process.env.OPENAI_API_KEY || "",
    header: "Authorization",
  },
  anthropic: {
    baseURL: "https://api.anthropic.com/v1",
    authKey: process.env.ANTHROPIC_API_KEY || "",
    header: "x-api-key",
  },
  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    authKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
    header: "x-goog-api-key",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    authKey: process.env.OPENROUTER_API_KEY || "",
    header: "Authorization",
  },
  xai: {
    baseURL: "https://api.x.ai/v1",
    authKey: process.env.XAI_API_KEY || "",
    header: "Authorization",
  },
  "z-ai": {
    baseURL: process.env.ZAI_BASE_URL || "https://api.z-ai.io/v1",
    authKey: process.env.ZAI_API_KEY || "",
    header: "Authorization",
  },
};

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function readDynamicProvider(providerId: string) {
  const [models, tools] = await Promise.all([
    siteConfigRepository.getConfig("models"),
    siteConfigRepository.getConfig("tools"),
  ]);
  const providers = models?.dynamicProviders as
    | Record<
        string,
        { baseURL?: unknown; apiKeyRef?: unknown; apiKey?: unknown }
      >
    | undefined;
  const provider = providers?.[providerId];
  if (!provider || typeof provider.baseURL !== "string") return null;

  const refs = tools?.apiKeysSecrets as Record<string, unknown> | undefined;
  const ref =
    typeof provider.apiKeyRef === "string"
      ? provider.apiKeyRef
      : `dyn_${providerId}`;
  const encrypted =
    (typeof refs?.[ref] === "string" && refs[ref]) ||
    (typeof refs?.[`dyn_${providerId}`] === "string" &&
      refs[`dyn_${providerId}`]) ||
    (typeof provider.apiKey === "string" && provider.apiKey);
  let authKey = "";
  if (typeof encrypted === "string" && encrypted) {
    try {
      authKey = decrypt(encrypted);
    } catch {
      return null;
    }
  }
  return { baseURL: provider.baseURL, authKey, header: "Authorization" };
}

async function testStaticProvider(config: ProviderConfig) {
  if (!config.authKey)
    return { success: false, latencyMs: 0, error: "No API key configured" };
  let endpoint: URL;
  try {
    endpoint = new URL(`${config.baseURL.replace(/\/$/u, "")}/models`);
  } catch {
    return { success: false, latencyMs: 0, error: "Invalid provider endpoint" };
  }
  const headers: Record<string, string> = {};
  headers[config.header] =
    config.header === "Authorization"
      ? `Bearer ${config.authKey}`
      : config.authKey;
  if (
    config.header === "Authorization" &&
    endpoint.hostname === "api.flare-sh.tech"
  ) {
    headers.Origin = process.env.FLARE_ORIGIN || "https://api.flare-sh.tech";
  }
  if (endpoint.hostname === "generativelanguage.googleapis.com") {
    endpoint.searchParams.set("pageSize", "1");
  } else if (endpoint.hostname === "api.anthropic.com") {
    headers["anthropic-version"] = "2023-06-01";
  }

  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel().catch(() => undefined);
    return {
      success: response.ok,
      latencyMs: Date.now() - started,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return {
      success: false,
      latencyMs: Date.now() - started,
      error: timeout ? "Request timed out" : "Connection failed",
    };
  }
}

async function testDynamicProvider(config: ProviderConfig) {
  if (!config.authKey)
    return { success: false, latencyMs: 0, error: "No API key configured" };
  let endpoint: URL;
  try {
    endpoint = new URL(`${config.baseURL.replace(/\/$/u, "")}/models`);
  } catch {
    return { success: false, latencyMs: 0, error: "Invalid provider endpoint" };
  }
  const started = Date.now();
  const result = await requestProviderDiscovery(
    endpoint.toString(),
    config.authKey,
  );
  return {
    success: result.status >= 200 && result.status < 300,
    latencyMs: Date.now() - started,
    ...(result.status >= 200 && result.status < 300
      ? {}
      : { error: `HTTP ${result.status}` }),
  };
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission("test model providers");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  const session = await getSession();
  if (!session?.user.id)
    return json({ success: false, error: "Unauthorized" }, 401);
  if (!hasSameOrigin(request))
    return json({ success: false, error: "Forbidden" }, 403);
  try {
    const rate = await checkApiRateLimit({
      kind: "admin-provider-connectivity-test",
      id: session.user.id,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return json({ success: false, error: "Too many requests" }, 429);
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
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
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return json({ success: false, error: "Invalid provider" }, 400);

  const providerId = parsed.data.provider.toLowerCase();
  const staticConfig = staticProviders[providerId];
  try {
    if (staticConfig) return json(await testStaticProvider(staticConfig));
    const dynamic = await readDynamicProvider(parsed.data.provider);
    if (!dynamic && parsed.data.provider !== providerId) {
      const caseInsensitive = await readDynamicProvider(providerId);
      if (caseInsensitive)
        return json(await testDynamicProvider(caseInsensitive));
    }
    if (!dynamic)
      return json({ success: false, latencyMs: 0, error: "Unknown provider" });
    return json(await testDynamicProvider(dynamic));
  } catch (error) {
    if (error instanceof ProviderDiscoveryTimeoutError) {
      return json({ success: false, latencyMs: 0, error: "Request timed out" });
    }
    if (error instanceof UrlBlockedError) {
      return json(
        {
          success: false,
          latencyMs: 0,
          error: "Endpoint must use a public HTTPS URL",
        },
        400,
      );
    }
    return json({
      success: false,
      latencyMs: 0,
      error: "Provider connection failed",
    });
  }
}
