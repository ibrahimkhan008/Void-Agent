import "server-only";

import { siteConfigRepository } from "lib/db/repository";
import {
  type ModelPricingMap,
  ModelPricingMapSchema,
  findModelPrice,
} from "./model-pricing";

export const getConfiguredModelPrice = async (
  provider: string,
  model: string,
) => {
  const config = await siteConfigRepository.getConfig("models");
  const parsed = ModelPricingMapSchema.safeParse(config?.modelPricing ?? {});
  if (!parsed.success) {
    throw new Error("Admin model pricing configuration is invalid.");
  }
  return findModelPrice(parsed.data, provider, model);
};

/** Budget enforcement is intentionally opt-in to avoid blocking legacy team chats. */
export const getTeamMemberBudgetsEnabled = async (): Promise<boolean> => {
  const config = await siteConfigRepository.getConfig("models");
  return config?.teamMemberBudgetsEnabled === true;
};

export const validateModelPricingMap = (
  input: unknown,
): ModelPricingMap | null => {
  const result = ModelPricingMapSchema.safeParse(input);
  return result.success ? result.data : null;
};
