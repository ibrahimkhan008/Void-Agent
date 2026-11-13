import "server-only";

import { siteConfigRepository } from "lib/db/repository";
import { decrypt } from "lib/security/encryption";

export const PAID_TIER_DODO_PRODUCT_ID_ENV: Record<string, string> = {
  "voidagent-pro": "DODO_PRODUCT_VOIDAGENT_PRO",
  "voidagent-max": "DODO_PRODUCT_VOIDAGENT_MAX",
  "voidagent-enterprises": "DODO_PRODUCT_VOIDAGENT_ENTERPRISES",
  "voidagent-enterprises-pro": "DODO_PRODUCT_VOIDAGENT_ENTERPRISES_PRO",
  "voidagent-enterprises-max": "DODO_PRODUCT_VOIDAGENT_ENTERPRISES_MAX",
};

export type DodoEnvironment = "test_mode" | "live_mode";

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

function nestedRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readStoredDodoConfig() {
  const [payments, tools] = await Promise.all([
    siteConfigRepository.getConfig("payments"),
    siteConfigRepository.getConfig("tools"),
  ]);
  const dodo = nestedRecord(nestedRecord(payments).dodo);
  const secrets = nestedRecord(nestedRecord(tools).apiKeysSecrets);
  return { dodo, secrets };
}

function decryptSecret(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return undefined;
  }
}

export async function getDodoConfig() {
  const { dodo, secrets } = await readStoredDodoConfig();
  const envApiKey = readEnv("DODO_PAYMENTS_API_KEY");
  const dbApiKey = decryptSecret(secrets.dodo_api_key);
  const envWebhookSecret = readEnv("DODO_WEBHOOK_SECRET");
  const dbWebhookSecret = decryptSecret(secrets.dodo_webhook_secret);
  const rawEnvironment = (
    readEnv("DODO_ENVIRONMENT") ??
    (typeof dodo.environment === "string" ? dodo.environment : "test_mode")
  ).toLowerCase();

  return {
    apiKey: envApiKey ?? dbApiKey,
    webhookSecret: envWebhookSecret ?? dbWebhookSecret,
    enabled: dodo.enabled === true,
    environment:
      rawEnvironment === "live_mode" ||
      rawEnvironment === "live" ||
      rawEnvironment === "production"
        ? ("live_mode" as const)
        : ("test_mode" as const),
    apiKeySource: envApiKey
      ? ("env" as const)
      : dbApiKey
        ? ("db" as const)
        : ("none" as const),
    webhookSecretSource: envWebhookSecret
      ? ("env" as const)
      : dbWebhookSecret
        ? ("db" as const)
        : ("none" as const),
  };
}

export async function getDodoProductIdForTier(
  tier: string,
): Promise<string | null> {
  const envName = PAID_TIER_DODO_PRODUCT_ID_ENV[tier];
  if (!envName) return null;
  const fromEnvironment = readEnv(envName);
  if (fromEnvironment) return fromEnvironment;
  const { dodo } = await readStoredDodoConfig();
  const productIds = nestedRecord(dodo.productIds);
  const configured = productIds[tier];
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : null;
}

export async function getTierForDodoProductId(
  productId: string | null | undefined,
): Promise<string | null> {
  if (!productId) return null;
  for (const [tier, envName] of Object.entries(PAID_TIER_DODO_PRODUCT_ID_ENV)) {
    if (readEnv(envName) === productId) return tier;
  }
  const { dodo } = await readStoredDodoConfig();
  const productIds = nestedRecord(dodo.productIds);
  for (const [tier, configured] of Object.entries(productIds)) {
    if (
      tier in PAID_TIER_DODO_PRODUCT_ID_ENV &&
      typeof configured === "string" &&
      configured.trim() === productId
    ) {
      return tier;
    }
  }
  return null;
}
