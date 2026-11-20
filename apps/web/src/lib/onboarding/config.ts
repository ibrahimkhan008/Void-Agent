import "server-only";

import { siteConfigRepository } from "lib/db/repository";

/**
 * Checks whether the new-user onboarding wizard is enabled in Admin Settings
 * (`site_config` key: "general", `featureFlags.onboardingFlow`).
 *
 * Defaults to `false` (off) until an administrator explicitly turns it on
 * from `/admin/settings/general`.
 */
export async function isOnboardingEnabled(): Promise<boolean> {
  try {
    const general = await siteConfigRepository.getConfig("general");
    const flags = general?.featureFlags as Record<string, unknown> | undefined;
    return flags?.onboardingFlow === true;
  } catch {
    return false;
  }
}
