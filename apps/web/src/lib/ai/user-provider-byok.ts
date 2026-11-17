import "server-only";

import { userRepository } from "@/lib/db/repository";
import { decrypt } from "@/lib/security/encryption";

export const USER_BYOK_PROVIDERS = [
  "alibaba",
  "anthropic",
  "cohere",
  "deepseek",
  "google",
  "mistral",
  "moonshotai",
  "openai",
  "xai",
  "zai",
] as const;

export type UserByokProvider = (typeof USER_BYOK_PROVIDERS)[number];

export function isUserByokProvider(value: string): value is UserByokProvider {
  return (USER_BYOK_PROVIDERS as readonly string[]).includes(value);
}

export function resolveByokProvider(modelId: string): UserByokProvider | null {
  const provider = modelId.split("/", 1)[0]?.toLowerCase();
  return provider && isUserByokProvider(provider) ? provider : null;
}

/**
 * Build the request-scoped AI Gateway BYOK payload for a resolved gateway
 * model. SDK-backed/direct models and unsupported gateway providers are left
 * untouched. A corrupt saved credential fails closed instead of silently
 * routing this request as though the user's credential were absent.
 */
export function resolveUserProviderCredential(
  modelId: string,
  encryptedKeys: Record<string, string> | undefined,
  decryptValue: (value: string) => string = decrypt,
): { provider: UserByokProvider; apiKey: string } | null {
  const provider = resolveByokProvider(modelId);
  const encrypted = provider ? encryptedKeys?.[provider] : undefined;
  if (!provider || !encrypted) return null;
  const apiKey = decryptValue(encrypted);
  if (!apiKey.trim()) throw new Error("Saved provider key is empty");
  return { provider, apiKey };
}

export async function loadUserProviderCredential(
  modelId: string,
  userId: string,
): Promise<{ provider: UserByokProvider; apiKey: string } | null> {
  const provider = resolveByokProvider(modelId);
  if (!provider) return null;
  const preferences = await userRepository.getPreferences(userId);
  return resolveUserProviderCredential(modelId, preferences?.aiProviderKeys);
}
