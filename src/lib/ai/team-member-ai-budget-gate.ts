import type { ModelPrice } from "./model-pricing";
import type { TeamBudgetPolicy } from "./team-member-ai-budget-core";

export class TeamBudgetModelUnpricedError extends Error {
  constructor() {
    super("This model has no administrator-configured usage pricing.");
    this.name = "TeamBudgetModelUnpricedError";
  }
}

export class TeamBudgetCurrencyMismatchError extends Error {
  constructor() {
    super("Model pricing and the team budget use different currencies.");
    this.name = "TeamBudgetCurrencyMismatchError";
  }
}

export const isValidTeamMemberBudgetRolloutValue = (
  value: unknown,
): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";

export const resolveTeamMemberBudgetGate = async (input: {
  enabled: unknown;
  teamId?: string;
  userId: string;
  model?: { provider?: string; model?: string };
  loadPolicy: (
    teamId: string,
    userId: string,
  ) => Promise<TeamBudgetPolicy | null>;
  loadPrice: (
    provider: string,
    model: string,
  ) => Promise<ModelPrice | undefined>;
}): Promise<{ teamId: string; price: ModelPrice } | undefined> => {
  if (input.enabled !== true || !input.teamId) return undefined;
  const policy = await input.loadPolicy(input.teamId, input.userId);
  if (!policy) return undefined;
  if (!input.model?.provider || !input.model.model) {
    throw new TeamBudgetModelUnpricedError();
  }
  const price = await input.loadPrice(input.model.provider, input.model.model);
  if (!price) throw new TeamBudgetModelUnpricedError();
  if (price.currency !== policy.currency) {
    throw new TeamBudgetCurrencyMismatchError();
  }
  return { teamId: input.teamId, price };
};
