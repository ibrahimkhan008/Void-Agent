export const SUBSCRIPTION_TIERS = {
  FREE: "free",
  VOIDAGENT_VOIDAGENT_PRO: "voidagent-pro",
  VOIDAGENT_VOIDAGENT_MAX: "voidagent-max",
  VOIDAGENT_ENTERPRISES: "voidagent-enterprises",
  VOIDAGENT_ENTERPRISES_PRO: "voidagent-enterprises-pro",
  VOIDAGENT_ENTERPRISES_MAX: "voidagent-enterprises-max",
} as const;

export type SubscriptionTierName =
  (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTierName =
  SUBSCRIPTION_TIERS.FREE;

export const subscriptionTiersInfo: Record<
  SubscriptionTierName,
  {
    label: string;
    pricePerMonthInr: number;
    description: string;
  }
> = {
  free: {
    label: "Free",
    pricePerMonthInr: 0,
    description: "Default free plan for all users.",
  },
  "voidagent-pro": {
    label: "Void Agent Pro",
    pricePerMonthInr: 799,
    description: "Higher daily limits and faster models for power users.",
  },
  "voidagent-max": {
    label: "Void Agent Max",
    pricePerMonthInr: 1999,
    description: "Generous limits and priority access to premium models.",
  },
  "voidagent-enterprises": {
    label: "Void Agent Enterprises",
    pricePerMonthInr: 3999,
    description: "Team-grade plan with deployment support.",
  },
  "voidagent-enterprises-pro": {
    label: "Void Agent Enterprises Pro",
    pricePerMonthInr: 5999,
    description: "Enterprise plan with enhanced security and support.",
  },
  "voidagent-enterprises-max": {
    label: "Void Agent Enterprises Max",
    pricePerMonthInr: 10999,
    description: "Highest enterprise tier with dedicated endpoints.",
  },
};

export const SUBSCRIPTION_TIER_VALUES = Object.values(SUBSCRIPTION_TIERS) as [
  SubscriptionTierName,
  ...SubscriptionTierName[],
];

export const normalizeSubscriptionTier = (
  value: string | null | undefined,
): SubscriptionTierName => {
  if (!value) return DEFAULT_SUBSCRIPTION_TIER;
  return SUBSCRIPTION_TIER_VALUES.includes(value as SubscriptionTierName)
    ? (value as SubscriptionTierName)
    : DEFAULT_SUBSCRIPTION_TIER;
};

export const isFreeTier = (value: string | null | undefined): boolean =>
  normalizeSubscriptionTier(value) === SUBSCRIPTION_TIERS.FREE;
