import type { UserPreferences } from "app-types/user";
import type { ResolvedNotificationPrefs } from "./types";

export const NOTIFICATION_PREFS_DEFAULTS: ResolvedNotificationPrefs = {
  desktopEnabled: true,
  onlyWhenAway: true,
  hideTaskDetails: false,
  weeklyEngagementEnabled: true,
  emailEnabled: false,
};

export function resolveNotificationPrefs(
  prefs?: UserPreferences["notifications"],
): ResolvedNotificationPrefs {
  return { ...NOTIFICATION_PREFS_DEFAULTS, ...prefs };
}
