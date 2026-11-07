import type { ChatModel } from "app-types/chat";
import { getSession } from "auth/server";
import { siteConfigRepository } from "lib/db/repository";
import { userModelProviderRepository } from "lib/db/repository";

type ProviderEnablementConfig = {
  providers?:
    | Record<string, { enabled?: unknown }>
    | Array<{ id: string; enabled?: unknown }>;
  dynamicProviders?: Record<string, { enabled?: unknown }>;
};

const findProviderConfig = <T>(
  providers: Record<string, T> | undefined,
  providerId: string,
) =>
  Object.entries(providers ?? {}).find(
    ([configuredId]) => configuredId.toLowerCase() === providerId.toLowerCase(),
  )?.[1];

const findStaticProviderConfig = (
  providers: ProviderEnablementConfig["providers"],
  providerId: string,
) => {
  if (Array.isArray(providers)) {
    return providers.find(
      (provider) => provider.id.toLowerCase() === providerId.toLowerCase(),
    );
  }
  return findProviderConfig(providers, providerId);
};

/**
 * Interpret the admin model-provider switch consistently on the API and chat
 * execution paths. Static providers default to enabled for older configs;
 * dynamic providers are default-deny because their admin form defaults them
 * to disabled.
 */
export function isChatProviderEnabled(
  providerId: string,
  config: ProviderEnablementConfig | null | undefined,
): boolean {
  const dynamic = findProviderConfig(config?.dynamicProviders, providerId);
  if (dynamic) return dynamic.enabled === true;

  const provider = findStaticProviderConfig(config?.providers, providerId);
  return provider?.enabled !== false;
}

export function filterEnabledChatProviders<T extends { provider: string }>(
  providers: T[],
  config: ProviderEnablementConfig | null | undefined,
): T[] {
  return providers.filter((provider) =>
    isChatProviderEnabled(provider.provider, config),
  );
}

export async function isChatModelProviderEnabled(model: ChatModel) {
  if (model.provider.startsWith("user-")) {
    const providerId = model.provider.slice("user-".length);
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return false;
    return userModelProviderRepository.isOwnedModel(
      userId,
      providerId,
      model.model,
    );
  }
  const config = await siteConfigRepository.getConfig("models");
  return isChatProviderEnabled(model.provider, config);
}
