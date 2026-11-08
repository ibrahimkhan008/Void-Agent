import type { ChatModel } from "app-types/chat";
import type { TeamModelRouteTask } from "lib/db/pg/schema.pg";
import {
  type ModelDisplayMetadata,
  type ModelDisplayMetadataMap,
  findModelDisplayMetadata,
} from "./model-display-metadata";
import {
  type RoutableModel,
  prioritizePinnedTeamModel,
  rankTeamModels,
} from "./team-model-routing";

export type PersonalAutomaticModel = RoutableModel & {
  displayMetadata: ModelDisplayMetadata;
};

export type PersonalAutomaticProviderInfo = {
  provider: string;
  hasAPIKey: boolean;
  models: Array<{
    name: string;
    isToolCallUnsupported: boolean;
    isImageInputUnsupported: boolean;
    displayMetadata?: ModelDisplayMetadata;
  }>;
};

export function hasPersonalAutomaticCatalog(
  providers: readonly PersonalAutomaticProviderInfo[],
  getContextTokens: (provider: string, model: string) => number | undefined,
): boolean {
  return providers.some(
    (provider) =>
      provider.hasAPIKey &&
      !provider.provider.startsWith("user-") &&
      provider.models.some((model) => {
        const metadata = model.displayMetadata;
        const hasTaskScore = Object.values(
          metadata?.automaticRoutingScores ?? {},
        ).some((score) => typeof score === "number" && score > 0);
        return (
          hasTaskScore &&
          (metadata?.automaticRoutingContextTokens !== undefined ||
            getContextTokens(provider.provider, model.name) !== undefined)
        );
      }),
  );
}

export function createPersonalAutomaticCatalog(input: {
  providers: readonly PersonalAutomaticProviderInfo[];
  displayMetadata: ModelDisplayMetadataMap;
  isProviderEnabled: (provider: string) => boolean;
  getContextTokens: (provider: string, model: string) => number | undefined;
}): PersonalAutomaticModel[] {
  const result: PersonalAutomaticModel[] = [];
  for (const provider of input.providers) {
    if (
      !provider.hasAPIKey ||
      provider.provider.startsWith("user-") ||
      !input.isProviderEnabled(provider.provider)
    ) {
      continue;
    }
    for (const model of provider.models) {
      const displayMetadata = findModelDisplayMetadata(
        input.displayMetadata,
        provider.provider,
        model.name,
      );
      if (!displayMetadata?.automaticRoutingScores) continue;
      result.push({
        provider: provider.provider,
        model: model.name,
        toolCalling: !model.isToolCallUnsupported,
        vision: !model.isImageInputUnsupported,
        contextTokens:
          input.getContextTokens(provider.provider, model.name) ??
          displayMetadata.automaticRoutingContextTokens,
        displayMetadata,
      });
    }
  }
  return result;
}

/**
 * Personal Auto is intentionally an explicit catalog, not a model-name
 * heuristic: only admin-scored models can participate. Capability checks use
 * the same catalog facts as Team Auto, and unknown context sizes fail closed.
 */
export function rankPersonalAutomaticModels(input: {
  models: readonly PersonalAutomaticModel[];
  task: TeamModelRouteTask;
  requiresTools: boolean;
  requiresVision: boolean;
  minimumContextTokens: number;
}): PersonalAutomaticModel[] {
  const candidates = input.models.filter(
    (model) =>
      (model.displayMetadata.automaticRoutingScores?.[input.task] ?? 0) > 0,
  );
  if (candidates.length === 0) return [];

  const ranked = rankTeamModels({
    policy: {
      enabled: true,
      profiles: candidates.map((model) => ({
        provider: model.provider,
        model: model.model,
        priority: model.displayMetadata.automaticRoutingPriority ?? 0,
        taskScores: model.displayMetadata.automaticRoutingScores ?? {},
      })),
    },
    availableModels: candidates,
    requirements: {
      task: input.task,
      requiresTools: input.requiresTools,
      requiresVision: input.requiresVision,
      minimumContextTokens: input.minimumContextTokens,
    },
  });

  const metadataByIdentity = new Map(
    candidates.map((model) => [
      `${model.provider.toLocaleLowerCase()}\u0000${model.model}`,
      model.displayMetadata,
    ]),
  );
  return ranked.flatMap((model) => {
    const displayMetadata = metadataByIdentity.get(
      `${model.provider.toLocaleLowerCase()}\u0000${model.model}`,
    );
    return displayMetadata ? [{ ...model, displayMetadata }] : [];
  });
}

/** Reuse the newest persisted assistant model when it remains eligible. */
export function findPreviousPersonalChatModel(
  messages: readonly unknown[] | null | undefined,
): ChatModel | null {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const record = message as {
      role?: unknown;
      metadata?: { chatModel?: unknown } | null;
    };
    if (record.role !== "assistant") continue;
    const model = record.metadata?.chatModel;
    if (!model || typeof model !== "object") continue;
    const candidate = model as { provider?: unknown; model?: unknown };
    if (
      typeof candidate.provider === "string" &&
      candidate.provider.trim() &&
      typeof candidate.model === "string" &&
      candidate.model.trim() &&
      candidate.provider.toLowerCase() !== "auto"
    ) {
      return { provider: candidate.provider, model: candidate.model };
    }
  }
  return null;
}

export function prioritizePreviousPersonalModel<T extends ChatModel>(
  candidates: readonly T[],
  previous: ChatModel | null,
): T[] {
  return prioritizePinnedTeamModel(candidates, previous);
}
