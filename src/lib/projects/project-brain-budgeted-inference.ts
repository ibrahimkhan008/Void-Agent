import "server-only";

import type { ChatModel } from "app-types/chat";
import { getTeamMemberBudgetsEnabled } from "lib/ai/model-pricing.server";
import { TeamBudgetPolicyError } from "lib/ai/team-member-ai-budget-core";
import {
  type TeamBudgetLease,
  reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest,
} from "lib/ai/team-member-ai-budget-runtime";
import { getProjectBrainStatusModel } from "lib/projects/project-brain-status";

type BudgetedInferenceInput<T> = {
  teamId?: string | null;
  userId: string;
  role: string;
  promptCharacters: number;
  estimatedOutputTokens?: number;
  idempotencyScope: string;
  run: (input: {
    model?: ChatModel;
    onProviderStart: () => void;
  }) => Promise<{ value: T; usage?: unknown }>;
};

/**
 * Covers persisted project-brain model work. Team member inference is pinned to
 * the enabled admin model and reserved before provider execution. Owner and
 * personal/budget-disabled paths preserve their existing exempt/fallback flow.
 */
export async function runProjectBrainBudgetedInference<T>(
  input: BudgetedInferenceInput<T>,
): Promise<T> {
  const enabled = Boolean(
    input.teamId && (await getTeamMemberBudgetsEnabled()),
  );
  if (!enabled) {
    const result = await input.run({ onProviderStart: () => undefined });
    return result.value;
  }

  const model = await getProjectBrainStatusModel();
  if (!model) {
    // The owner remains exempt from budget policy, but keeps the legacy
    // provider fallback if no explicit admin model is configured.
    if (input.role === "owner") {
      const result = await input.run({ onProviderStart: () => undefined });
      return result.value;
    }
    throw new TeamBudgetPolicyError(
      "No enabled project-brain model is configured.",
    );
  }

  let lease: TeamBudgetLease | undefined;
  if (input.role !== "owner") {
    lease = await reserveTeamBudgetForAiRequest({
      teamId: input.teamId,
      userId: input.userId,
      model,
      promptCharacters: input.promptCharacters,
      ...(input.estimatedOutputTokens === undefined
        ? {}
        : { estimatedOutputTokens: input.estimatedOutputTokens }),
      idempotencyScope: input.idempotencyScope,
    });
    // Non-owner access without a reservation is an authorization/configuration
    // failure. Never proceed with an unmetered billed team request.
    if (!lease)
      throw new TeamBudgetPolicyError(
        "Team AI budget reservation was not created.",
      );
  }

  let providerStarted = false;
  try {
    const result = await input.run({
      model,
      onProviderStart: () => {
        providerStarted = true;
      },
    });
    if (lease)
      await settleTeamBudgetForAiRequest(lease, { usage: result.usage });
    return result.value;
  } catch (error) {
    // Release only when the provider could not have consumed tokens. Once a
    // call starts, retain the reservation until normal settlement/expiry.
    if (lease && !providerStarted)
      await settleTeamBudgetForAiRequest(lease, { aborted: true });
    throw error;
  }
}
