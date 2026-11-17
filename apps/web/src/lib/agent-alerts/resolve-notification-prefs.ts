import type { UserPreferences } from "app-types/user";
import type { ResolvedNotificationPrefs } from "./types";

export const NOTIFICATION_PREFS_DEFAULTS: ResolvedNotificationPrefs = {
  desktopEnabled: true,
  onlyWhenAway: true,
  hideTaskDetails: false,
  weeklyEngagementEnabled: true,
  emailEnabled: false,
  emailDigestEnabled: false,
  emailScheduledSuccess: true,
  emailScheduledFailure: true,
  emailHookFailure: true,
};

export function resolveNotificationPrefs(
  prefs?: UserPreferences["notifications"],
): ResolvedNotificationPrefs {
  return { ...NOTIFICATION_PREFS_DEFAULTS, ...prefs };
}
