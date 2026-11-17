import "server-only";
import type { ChatModel } from "app-types/chat";
import { siteConfigRepository } from "lib/db/repository";
import logger from "logger";
import { validateManualModel } from "./service";
import type { RoutingCandidate } from "./types";

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
  const seen = new Set([`${primary.provider}/${primary.model}`]);

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

/**
 * Resolve policy-approved fallbacks for AI Gateway's pre-output model
 * failover. The Gateway can only retry before it has emitted a response, so
 * this is the safe stream retry boundary: it never replays a partially
 * persisted assistant message or repeats tool side effects.
 *
 * We only return candidates with known prices no higher than the selected
 * model on either token dimension. That keeps the existing reservation a
 * conservative upper bound while we attribute final usage to Gateway's
 * successful-model metadata.
 */
export async function resolveGatewayFallbackCandidates(input: {
  organizationId?: string | null;
  userId: string;
  primary: ChatModel;
  primaryCandidate: RoutingCandidate;
  requiresTools: boolean;
  requiresVision: boolean;
}): Promise<RoutingCandidate[]> {
  const chain = buildChain(await loadModelsConfig(), input.primary);
  const candidates: RoutingCandidate[] = [];

  for (const entry of chain) {
    try {
      const route = await validateManualModel({
        organizationId: input.organizationId,
        userId: input.userId,
        chatModel: { provider: entry.provider, model: entry.model },
      });
      const candidate = route.candidate;
      if (
        !candidate ||
        candidate.inputPriceMicrosPerMillion <= 0 ||
        candidate.outputPriceMicrosPerMillion <= 0 ||
        candidate.inputPriceMicrosPerMillion >
          input.primaryCandidate.inputPriceMicrosPerMillion ||
        candidate.outputPriceMicrosPerMillion >
          input.primaryCandidate.outputPriceMicrosPerMillion ||
        (input.requiresTools && !candidate.supportsTools) ||
        (input.requiresVision && !candidate.supportsVision)
      ) {
        continue;
      }
      candidates.push(candidate);
    } catch {
      // Policy-refused or unavailable candidates are never passed to Gateway.
    }
  }
  return candidates;
}

/** Return the successful model slug reported by AI Gateway, if present. */
export function getSuccessfulGatewayModelSlug(
  providerMetadata: unknown,
): string | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const gateway = (providerMetadata as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== "object") return null;
  const routing = (gateway as Record<string, unknown>).routing;
  if (!routing || typeof routing !== "object") return null;
  const modelAttempts = (routing as Record<string, unknown>).modelAttempts;
  if (!Array.isArray(modelAttempts)) return null;

  for (let index = modelAttempts.length - 1; index >= 0; index--) {
    const attempt = modelAttempts[index];
    if (!attempt || typeof attempt !== "object") continue;
    const model = attempt as Record<string, unknown>;
    const providerAttempts = model.providerAttempts;
    if (
      !Array.isArray(providerAttempts) ||
      !providerAttempts.some(
        (providerAttempt) =>
          !!providerAttempt &&
          typeof providerAttempt === "object" &&
          (providerAttempt as Record<string, unknown>).success === true,
      )
    ) {
      continue;
    }
    return typeof model.canonicalSlug === "string" ? model.canonicalSlug : null;
  }
  return null;
}

/** Match Gateway's successful canonical slug to an already policy-validated candidate. */
export function findGatewayFallbackCandidate(input: {
  providerMetadata: unknown;
  candidates: RoutingCandidate[];
}): RoutingCandidate | undefined {
  const slug = getSuccessfulGatewayModelSlug(input.providerMetadata);
  if (!slug) return undefined;
  const normalized = slug.toLowerCase();
  return input.candidates.find((candidate) => {
    const possibleSlugs = [
      candidate.providerModelId,
      `${candidate.chatModel.provider}/${candidate.chatModel.model}`,
    ];
    return possibleSlugs.some(
      (candidateSlug) => candidateSlug.toLowerCase() === normalized,
    );
  });
}

export type GatewayUsageGroup = {
  candidate: RoutingCandidate;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
};

/** Attribute each completed model step to the successful Gateway model. */
export function groupGatewayStepUsage<
  T extends {
    providerMetadata?: unknown;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokenDetails?: {
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        noCacheTokens?: number;
      };
    };
  },
>(input: {
  steps: T[];
  candidates: RoutingCandidate[];
  defaultCandidate: RoutingCandidate;
}): GatewayUsageGroup[] {
  const groups = new Map<string, GatewayUsageGroup>();
  for (const step of input.steps) {
    const usage = step.usage;
    if (!usage) continue;
    const candidate =
      findGatewayFallbackCandidate({
        providerMetadata: step.providerMetadata,
        candidates: input.candidates,
      }) ?? input.defaultCandidate;
    const key = candidate.deploymentId;
    const group = groups.get(key) ?? {
      candidate,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: 0,
    };
    group.inputTokens += usage.inputTokens ?? 0;
    group.outputTokens += usage.outputTokens ?? 0;
    group.cacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
    group.cacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;
    group.noCacheTokens += usage.inputTokenDetails?.noCacheTokens ?? 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}
