import type { UserPreferences } from "app-types/user";

export const DIGEST_NOTIFICATION_TYPES = [
  "scheduled_run_success",
  "scheduled_run_failure",
  "hook_run_failure",
] as const;

export type DigestNotification = {
  userId: string;
  email: string;
  verified: boolean;
  type: string;
  preferences: UserPreferences | null;
};

function typeEnabled(
  type: string,
  preferences?: UserPreferences["notifications"],
) {
  if (type === "scheduled_run_success")
    return preferences?.emailScheduledSuccess !== false;
  if (type === "scheduled_run_failure")
    return preferences?.emailScheduledFailure !== false;
  if (type === "hook_run_failure")
    return preferences?.emailHookFailure !== false;
  return false;
}

/** Group only verified, opted-in users and only events they enabled. */
export function groupDailyDigestRecipients(rows: DigestNotification[]) {
  const counts = new Map<
    string,
    { userId: string; email: string; count: number }
  >();
  for (const row of rows) {
    const prefs = row.preferences?.notifications;
    if (
      !row.verified ||
      prefs?.emailEnabled !== true ||
      prefs.emailDigestEnabled !== true ||
      !typeEnabled(row.type, prefs)
    ) {
      continue;
    }
    const current = counts.get(row.userId);
    if (current) current.count += 1;
    else
      counts.set(row.userId, {
        userId: row.userId,
        email: row.email,
        count: 1,
      });
  }
  return [...counts.values()];
}

/** A privacy-preserving digest; event titles and bodies may contain prompts. */
export function buildDailyDigestEmail(count: number, baseUrl: string) {
  const href = new URL("/", baseUrl).toString();
  return {
    subject: "Your Void Agent daily notification summary",
    body: `You have ${count} new notification${count === 1 ? "" : "s"} from scheduled tasks and hooks.\n\nOpen Void Agent to review them: ${href}`,
  };
}
