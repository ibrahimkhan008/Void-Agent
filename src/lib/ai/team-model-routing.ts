import type { ChatModel } from "app-types/chat";
import type {
  TeamModelRouteProfile,
  TeamModelRouteTask,
} from "lib/db/pg/schema.pg";

export const TEAM_ROUTE_SYSTEM_CONTEXT_RESERVE_TOKENS = 32_768;
export const TEAM_ROUTE_MAX_OUTPUT_TOKENS = 4_096;

export type RoutableModel = ChatModel & {
  toolCalling: boolean;
  vision: boolean;
  /** Exact, provider-specific context capacity when known. */
  contextTokens?: number;
};

export type TeamModelRoutingPolicy = {
  enabled: boolean;
  profiles: TeamModelRouteProfile[];
};

export type TeamModelRouteRequirements = {
  task: TeamModelRouteTask;
  requiresTools: boolean;
  requiresVision: boolean;
  /** Conservative full-request token budget including reserved system/tool/output space. */
  minimumContextTokens?: number;
};

export class TeamModelRouteUnavailableError extends Error {
  constructor() {
    super("No team-approved model satisfies this request.");
    this.name = "TeamModelRouteUnavailableError";
  }
}

const normalizeProvider = (provider: string) => provider.toLowerCase();

/**
 * Rank only models both enabled by the global admin and explicitly allowed by
 * the team policy. Lexical tie-breaks make routing stable across DB row order.
 */
export function rankTeamModels({
  policy,
  availableModels,
  requirements,
}: {
  policy: TeamModelRoutingPolicy;
  availableModels: readonly RoutableModel[];
  requirements: TeamModelRouteRequirements;
}): RoutableModel[] {
  if (!policy.enabled) throw new TeamModelRouteUnavailableError();

  const available = new Map(
    availableModels.map((model) => [
      `${normalizeProvider(model.provider)}\u0000${model.model}`,
      model,
    ]),
  );
  const eligible = policy.profiles.flatMap((profile) => {
    const model = available.get(
      `${normalizeProvider(profile.provider)}\u0000${profile.model}`,
    );
    if (!model) return [];
    if (requirements.requiresTools && !model.toolCalling) return [];
    if (requirements.requiresVision && !model.vision) return [];
    if (
      requirements.minimumContextTokens !== undefined &&
      (!Number.isSafeInteger(requirements.minimumContextTokens) ||
        requirements.minimumContextTokens < 0 ||
        model.contextTokens === undefined ||
        model.contextTokens < requirements.minimumContextTokens)
    ) {
      return [];
    }
    const score = profile.taskScores[requirements.task] ?? 0;
    return [{ model, score, priority: profile.priority }];
  });

  eligible.sort(
    (a, b) =>
      b.score - a.score ||
      a.priority - b.priority ||
      normalizeProvider(a.model.provider).localeCompare(
        normalizeProvider(b.model.provider),
      ) ||
      a.model.model.localeCompare(b.model.model),
  );
  const result = eligible.map(({ model }) => model);
  if (result.length === 0) throw new TeamModelRouteUnavailableError();
  return result;
}

/**
 * Estimate a minimum context capacity from the serialized conversation sent
 * with this request. Two characters per token is intentionally more
 * conservative than the cost estimator's four-character heuristic. Reserve
 * 32K tokens for system/policy/tool/retrieval context and the same bounded
 * output limit enforced for Team Auto generations.
 * Serialization failures produce Infinity so Team Auto fails closed.
 */
export function estimateTeamRouteMinimumContextTokens(
  conversation: unknown,
): number {
  try {
    const serialized = JSON.stringify(conversation);
    if (typeof serialized !== "string") return Number.POSITIVE_INFINITY;
    const conversationTokens = Math.ceil(serialized.length / 2);
    const estimate =
      conversationTokens +
      TEAM_ROUTE_SYSTEM_CONTEXT_RESERVE_TOKENS +
      TEAM_ROUTE_MAX_OUTPUT_TOKENS;
    return Number.isSafeInteger(estimate) ? estimate : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function prioritizePinnedTeamModel<T extends ChatModel>(
  candidates: readonly T[],
  pin: ChatModel | null,
): T[] {
  if (!pin) return [...candidates];
  const pinned = candidates.find(
    (candidate) =>
      candidate.provider.toLowerCase() === pin.provider.toLowerCase() &&
      candidate.model === pin.model,
  );
  return pinned
    ? [pinned, ...candidates.filter((candidate) => candidate !== pinned)]
    : [...candidates];
}

export async function materializeTeamRoute<T extends ChatModel, TResult>(
  candidates: readonly T[],
  materialize: (candidate: T) => Promise<TResult>,
): Promise<{ candidate: T; value: TResult; fallbackUsed: boolean }> {
  for (const [index, candidate] of candidates.entries()) {
    try {
      return {
        candidate,
        value: await materialize(candidate),
        fallbackUsed: index > 0,
      };
    } catch {
      // The next candidate is still constrained by the same team allowlist.
    }
  }
  throw new TeamModelRouteUnavailableError();
}

const taskRules: Array<[TeamModelRouteTask, RegExp]> = [
  ["web_search", /\b(search|look up|find current|browse the web)\b/i],
  ["web_development", /\b(website|web app|frontend|css|react|next\.js)\b/i],
  ["coding", /\b(code|debug|function|typescript|javascript|python|sql)\b/i],
  [
    "document_extraction",
    /\b(extract|summari[sz]e this document|from the pdf)\b/i,
  ],
  ["reasoning", /\b(reason|prove|compare|analy[sz]e|evaluate)\b/i],
  ["writing", /\b(write|draft|rewrite|edit|compose)\b/i],
];

export function inferTeamModelRouteTask(text: string): TeamModelRouteTask {
  return (
    taskRules.find(([, pattern]) => pattern.test(text))?.[0] ?? "general_chat"
  );
}
