export class TeamBudgetAuthorizationError extends Error {
  constructor() {
    super("The authenticated user is not a member of this team.");
    this.name = "TeamBudgetAuthorizationError";
  }
}

export class TeamBudgetPolicyError extends Error {
  constructor(message = "The team member budget policy is unavailable.") {
    super(message);
    this.name = "TeamBudgetPolicyError";
  }
}

export class TeamBudgetExceededError extends Error {
  constructor() {
    super("This team member's monthly AI allowance has been reached.");
    this.name = "TeamBudgetExceededError";
  }
}

export type TeamBudgetPolicy = {
  memberId: string;
  userId: string;
  teamId: string;
  role: string;
  teamOwnerId: string;
  monthlyCapMicros: number | null;
  currency: string;
  hardStop: boolean;
};

export const resolveMemberBudgetPolicy = (input: {
  policy: TeamBudgetPolicy | null;
  userId: string;
  teamId: string;
}): TeamBudgetPolicy | null => {
  const { policy, userId, teamId } = input;
  if (!policy || policy.userId !== userId || policy.teamId !== teamId) {
    throw new TeamBudgetAuthorizationError();
  }
  if (policy.role === "owner" || policy.teamOwnerId === userId) return null;
  if (policy.monthlyCapMicros === null || !policy.hardStop) {
    throw new TeamBudgetPolicyError();
  }
  if (
    !Number.isSafeInteger(policy.monthlyCapMicros) ||
    policy.monthlyCapMicros < 0 ||
    !/^[A-Z]{3}$/.test(policy.currency)
  ) {
    throw new TeamBudgetPolicyError();
  }
  return policy;
};

export const checkBudgetReservation = (input: {
  finalizedMicros: number;
  reservedMicros: number;
  capMicros: number;
  estimateMicros: number;
}): { allowed: boolean; nextReservedMicros: number } => {
  const values = Object.values(input);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new TeamBudgetPolicyError("Invalid team AI budget counters.");
  }
  const projected =
    input.finalizedMicros + input.reservedMicros + input.estimateMicros;
  if (!Number.isSafeInteger(projected)) {
    throw new TeamBudgetPolicyError(
      "Team AI budget counters exceed the supported range.",
    );
  }
  const allowed = projected <= input.capMicros;
  return {
    allowed,
    nextReservedMicros: allowed
      ? input.reservedMicros + input.estimateMicros
      : input.reservedMicros,
  };
};

export const settleBudgetCounters = (input: {
  finalizedMicros: number;
  reservedMicros: number;
  estimateMicros: number;
  actualMicros?: number;
}) => {
  const actual = input.actualMicros ?? 0;
  const finalizedMicros = input.finalizedMicros + actual;
  if (
    [
      input.finalizedMicros,
      input.reservedMicros,
      input.estimateMicros,
      actual,
    ].some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(finalizedMicros)
  ) {
    throw new TeamBudgetPolicyError("Invalid team AI budget settlement.");
  }
  return {
    reservedMicros: Math.max(0, input.reservedMicros - input.estimateMicros),
    finalizedMicros,
  };
};

export const getCurrentBudgetPeriod = (now = new Date()) => ({
  start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
});
