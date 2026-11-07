import "server-only";

import { generateUUID } from "lib/utils";
import {
  type ModelPrice,
  calculateCostMicros,
  estimateCostMicros,
  normalizeModelKey,
} from "./model-pricing";
import {
  getConfiguredModelPrice,
  getTeamMemberBudgetsEnabled,
} from "./model-pricing.server";
import {
  finalizeTeamMemberBudget,
  getTeamMemberBudgetPolicy,
  releaseTeamMemberBudget,
  reserveTeamMemberBudget,
} from "./team-member-ai-budget";
import { resolveTeamMemberBudgetGate } from "./team-member-ai-budget-gate";

export type TeamBudgetModel = { provider?: string; model?: string };

export type TeamBudgetLease = {
  reservationId: string;
  estimateMicros: number;
  price: ModelPrice;
};

/**
 * Reserve a conservative amount for an authenticated, persisted team resource.
 * Callers must derive teamId from server-owned state, never request JSON.
 */
export async function reserveTeamBudgetForAiRequest(input: {
  teamId?: string | null;
  userId: string;
  model?: TeamBudgetModel;
  promptCharacters: number;
  idempotencyScope: string;
}): Promise<TeamBudgetLease | undefined> {
  if (!input.teamId || !(await getTeamMemberBudgetsEnabled())) return undefined;

  const gate = await resolveTeamMemberBudgetGate({
    enabled: true,
    teamId: input.teamId,
    userId: input.userId,
    model: input.model,
    loadPolicy: getTeamMemberBudgetPolicy,
    loadPrice: getConfiguredModelPrice,
  });
  if (!gate) return undefined;

  const estimateMicros = estimateCostMicros(input.promptCharacters, gate.price);
  const reservation = await reserveTeamMemberBudget({
    teamId: gate.teamId,
    userId: input.userId,
    modelKey: normalizeModelKey(input.model!.provider!, input.model!.model!),
    currency: gate.price.currency,
    estimateMicros,
    idempotencyKey: `${gate.teamId}:${input.userId}:${input.idempotencyScope}:${generateUUID()}`,
  });
  if (!reservation) return undefined;
  return { reservationId: reservation.id, estimateMicros, price: gate.price };
}

export function normalizeModelUsage(
  usage: unknown,
): { inputTokens: number; outputTokens: number } | null {
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const input =
    record.inputTokens ?? record.promptTokens ?? record.prompt_tokens;
  const output =
    record.outputTokens ?? record.completionTokens ?? record.completion_tokens;
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < 0 ||
    typeof output !== "number" ||
    !Number.isSafeInteger(output) ||
    output < 0
  ) {
    return null;
  }
  return { inputTokens: input, outputTokens: output };
}

/** Settle exactly once in the ledger; absent provider usage settles estimate. */
export async function settleTeamBudgetForAiRequest(
  lease: TeamBudgetLease | undefined,
  input: { aborted?: boolean; usage?: unknown },
): Promise<void> {
  if (!lease) return;
  if (input.aborted) {
    await releaseTeamMemberBudget(lease.reservationId);
    return;
  }
  const usage = normalizeModelUsage(input.usage);
  await finalizeTeamMemberBudget({
    reservationId: lease.reservationId,
    actualMicros: usage
      ? calculateCostMicros(usage, lease.price)
      : lease.estimateMicros,
  });
}
