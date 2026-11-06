import "server-only";

import type { Agent } from "app-types/agent";
import type { ChatModel } from "app-types/chat";
import {
  customModelProvider,
  ensureDynamicProvidersHydrated,
} from "lib/ai/models";
import { siteConfigRepository } from "lib/db/repository";

export type AgentModelOption = {
  provider: string;
  model: string;
  value: string;
};

export class AgentPinnedModelUnavailableError extends Error {
  constructor() {
    super("The agent's pinned model is no longer enabled or available.");
    this.name = "AgentPinnedModelUnavailableError";
  }
}

/** Parse the reference contract `provider/model`, preserving slashes in model IDs. */
export function parsePinnedAgentModel(value: unknown): ChatModel | null {
  if (typeof value !== "string") return null;
  const separator = value.indexOf("/");
  if (separator <= 0) return null;
  const provider = value.slice(0, separator).trim();
  const model = value.slice(separator + 1).trim();
  if (
    !provider ||
    provider.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(provider) ||
    !model ||
    model.length > 120
  ) {
    return null;
  }
  return { provider, model };
}

const findCaseInsensitive = <T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined => {
  if (!record) return undefined;
  const match = Object.keys(record).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );
  return match ? record[match] : undefined;
};

/**
 * Build the server-side catalog from providers currently enabled by admin and
 * available to the model runtime. API keys/config and raw provider endpoints
 * are never returned to the client.
 */
export async function getEnabledAgentModelCatalog(): Promise<
  AgentModelOption[]
> {
  await ensureDynamicProvidersHydrated();
  const config = await siteConfigRepository.getConfig("models");
  const configuredStatic =
    (config?.providers as Record<string, { enabled?: unknown }> | undefined) ??
    {};
  const dynamicProviders = config?.dynamicProviders ?? {};

  return customModelProvider.modelsInfo.flatMap((providerInfo) => {
    const dynamic = findCaseInsensitive(
      dynamicProviders,
      providerInfo.provider,
    );
    const staticConfig = findCaseInsensitive(
      configuredStatic,
      providerInfo.provider,
    );
    const providerEnabled = dynamic
      ? dynamic.enabled === true
      : staticConfig?.enabled !== false;
    if (!providerEnabled || !providerInfo.hasAPIKey) return [];

    return providerInfo.models.map((modelInfo) => ({
      provider: providerInfo.provider,
      model: modelInfo.name,
      value: `${providerInfo.provider}/${modelInfo.name}`,
    }));
  });
}

export async function isEnabledAgentModel(value: unknown): Promise<boolean> {
  const parsed = parsePinnedAgentModel(value);
  if (!parsed) return false;
  const catalog = await getEnabledAgentModelCatalog();
  return catalog.some(
    (option) =>
      option.provider.toLowerCase() === parsed.provider.toLowerCase() &&
      option.model === parsed.model,
  );
}

/** Only an agent returned by the caller-scoped repository lookup is passed here. */
export function resolveAgentChatModel(
  requested: ChatModel | undefined,
  authorizedAgent: Pick<Agent, "instructions"> | null | undefined,
  enabledCatalog: readonly AgentModelOption[],
): ChatModel | undefined {
  const pin = authorizedAgent?.instructions.model;
  if (pin == null || pin.trim() === "") return requested;

  const parsed = parsePinnedAgentModel(pin);
  if (
    !parsed ||
    !enabledCatalog.some(
      (option) =>
        option.provider.toLowerCase() === parsed.provider.toLowerCase() &&
        option.model === parsed.model,
    )
  ) {
    throw new AgentPinnedModelUnavailableError();
  }
  return parsed;
}
