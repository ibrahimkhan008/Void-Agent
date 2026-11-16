import "server-only";
import type { ChatModel } from "app-types/chat";
import type { RoutingCandidate } from "./types";
import { validateManualModel } from "./service";
import { siteConfigRepository } from "lib/db/repository";
import logger from "logger";

/**
 * Void Intelligence fallback-chain consumer (master prompt §3.1 — "Model
 * fallback and retry"). The admin Models settings persist per-provider
 * fallback chains (`providers[id].fallbackChain`, ≤3 entries) and a global
 * chain (`globalFallback`); until now nothing consumed them. This module
 * walks the chain at RESOLUTION time: when the requested model is refused
 * by the org policy (MANUAL_MODEL_NOT_ALLOWED), each fallback candidate is
 * validated in order — the first that the organization actually allows
 * becomes the chat model. Validation reuses validateManualModel, so org
 * policy, pricing and data-retention gates apply to fallbacks too.
 */

interface ChainEntry {
  provider: string;
  model: string;
}

interface ModelsConfigShape {
  providers?: Record<
    string,
    { fallbackChain?: ChainEntry[]; fallbackModel?: string }
  >;
  globalFallback?: ChainEntry[];
}

async function loadModelsConfig(): Promise<ModelsConfigShape> {
  try {
    const settings = await siteConfigRepository.getConfig("models");
    return (settings ?? {}) as ModelsConfigShape;
  } catch (error) {
    logger.error(
      "[routing] failed to load the fallback chain from site_config",
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

function buildChain(
  config: ModelsConfigShape,
  primary: ChatModel,
): ChainEntry[] {
  const chain: ChainEntry[] = [];
  const seen = new Set([
    `${primary.provider}/${primary.model}`,
  ]);

  // 1. The primary model's own provider chain (its deployment-first policy).
  const providerChain = config.providers?.[primary.provider]?.fallbackChain;
  for (const entry of Array.isArray(providerChain) ? providerChain : []) {
    if (!entry?.provider || !entry?.model) continue;
    const key = `${entry.provider}/${entry.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push({ provider: entry.provider, model: entry.model });
  }

  // 2. The global chain as the tail.
  for (const entry of Array.isArray(config.globalFallback)
    ? config.globalFallback
    : []) {
    if (!entry?.provider || !entry?.model) continue;
    const key = `${entry.provider}/${entry.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push({ provider: entry.provider, model: entry.model });
  }

  return chain.slice(0, 4);
}

/**
 * Walks the fallback chain for a refused model. Returns the first chain
 * entry that passes the org policy, or null when the chain is empty or
 * every entry is also refused (the caller then keeps its original error).
 */
export async function resolveFallbackModel(input: {
  organizationId?: string | null;
  userId: string;
  primary: ChatModel;
}): Promise<{
  chatModel: ChatModel;
  candidate?: RoutingCandidate;
  memberId?: string;
  chain: ChatModel[];
} | null> {
  const config = await loadModelsConfig();
  const chain = buildChain(config, input.primary);
  if (!chain.length) return null;

  for (const entry of chain) {
    try {
      const route = await validateManualModel({
        organizationId: input.organizationId,
        userId: input.userId,
        chatModel: { provider: entry.provider, model: entry.model },
      });
      logger.info(
        `[routing] fallback chain: ${input.primary.provider}/${input.primary.model} -> ${entry.provider}/${entry.model}`,
      );
      return {
        chatModel: route.chatModel,
        candidate: route.candidate,
        memberId: route.memberId,
        chain: [{ provider: entry.provider, model: entry.model }],
      };
    } catch {
      // This entry is also refused — try the next one.
      continue;
    }
  }
  logger.info(
    `[routing] fallback chain exhausted for ${input.primary.provider}/${input.primary.model}`,
  );
  return null;
}
