import "server-only";

import { getSession } from "auth/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  PAID_TIER_DODO_PRODUCT_ID_ENV,
  getDodoConfig,
} from "lib/payments/dodo-config";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { encrypt, isEncryptionAvailable } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;
const productIdsSchema = z
  .object({
    "flare-pro": z.string().trim().max(128).optional(),
    "flare-max": z.string().trim().max(128).optional(),
    "flare-enterprises": z.string().trim().max(128).optional(),
    "flare-enterprises-pro": z.string().trim().max(128).optional(),
    "flare-enterprises-max": z.string().trim().max(128).optional(),
  })
  .strict();
const payloadSchema = z
  .object({
    enabled: z.boolean().optional(),
    environment: z.enum(["test_mode", "live_mode"]).optional(),
    productIds: productIdsSchema.optional(),
    apiKey: z.string().max(4_096).optional(),
    webhookSecret: z.string().max(4_096).optional(),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function authorize(request?: Request) {
  try {
    await requireAdminPermission("manage settings");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!request) return null;
  if (!hasSameOrigin(request))
    return json({ success: false, error: "Forbidden" }, 403);
  const session = await getSession();
  if (!session?.user.id)
    return json({ success: false, error: "Unauthorized" }, 401);
  try {
    const result = await checkApiRateLimit({
      kind: "admin-dodo-config",
      id: session.user.id,
      limit: 20,
      windowMs: 60_000,
    });
    if (!result.allowed)
      return json({ success: false, error: "Too many requests" }, 429);
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }
  return null;
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const [payments, config] = await Promise.all([
      siteConfigRepository.getConfig("payments"),
      getDodoConfig(),
    ]);
    const settings = (payments?.dodo ?? {}) as Record<string, unknown>;
    const configuredIds = (settings.productIds ?? {}) as Record<
      string,
      unknown
    >;
    const productIds = Object.fromEntries(
      Object.entries(PAID_TIER_DODO_PRODUCT_ID_ENV).map(([tier, envName]) => [
        tier,
        {
          env: process.env[envName]?.trim() || null,
          configured:
            typeof configuredIds[tier] === "string" &&
            Boolean((configuredIds[tier] as string).trim()),
        },
      ]),
    );
    return json({
      success: true,
      dodo: {
        enabled: config.enabled,
        environment: config.environment,
        productIds,
        apiKeyConfigured: Boolean(config.apiKey),
        apiKeySource: config.apiKeySource,
        webhookSecretConfigured: Boolean(config.webhookSecret),
        webhookSecretSource: config.webhookSecretSource,
      },
      billingEnabled:
        config.enabled && Boolean(config.apiKey && config.webhookSecret),
    });
  } catch {
    return json(
      { success: false, error: "Failed to read Dodo configuration" },
      500,
    );
  }
}

export async function POST(request: Request) {
  const denied = await authorize(request);
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
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success)
    return json({ success: false, error: "Invalid Dodo configuration" }, 400);

  const apiKey = parsed.data.apiKey?.trim();
  const webhookSecret = parsed.data.webhookSecret?.trim();
  if ((apiKey || webhookSecret) && !isEncryptionAvailable()) {
    return json({ success: false, error: "Encryption is not configured" }, 503);
  }

  try {
    const [payments, tools] = await Promise.all([
      siteConfigRepository.getConfig("payments"),
      siteConfigRepository.getConfig("tools"),
    ]);
    const currentDodo = (payments?.dodo ?? {}) as Record<string, unknown>;
    const nextDodo: Record<string, unknown> = { ...currentDodo };
    if (parsed.data.enabled !== undefined)
      nextDodo.enabled = parsed.data.enabled;
    if (parsed.data.environment) nextDodo.environment = parsed.data.environment;
    if (parsed.data.productIds) {
      const productIds = {
        ...((currentDodo.productIds ?? {}) as Record<string, string>),
      };
      for (const [tier, value] of Object.entries(parsed.data.productIds)) {
        if (value) productIds[tier] = value;
        else delete productIds[tier];
      }
      nextDodo.productIds = productIds;
    }

    const secrets = {
      ...((tools?.apiKeysSecrets ?? {}) as Record<string, string>),
    };
    if (apiKey) secrets.dodo_api_key = encrypt(apiKey);
    if (webhookSecret) secrets.dodo_webhook_secret = encrypt(webhookSecret);

    await siteConfigRepository.upsert("payments", {
      ...(payments ?? {}),
      dodo: nextDodo,
    });
    if (apiKey || webhookSecret) {
      await siteConfigRepository.upsert("tools", {
        ...(tools ?? {}),
        apiKeysSecrets: secrets,
      });
    }
    return json({ success: true });
  } catch {
    return json(
      { success: false, error: "Failed to save Dodo configuration" },
      500,
    );
  }
}
