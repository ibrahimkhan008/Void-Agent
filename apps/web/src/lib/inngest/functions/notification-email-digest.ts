import { runDailyDigest } from "@/lib/notifications/digest-cron";
import { inngest } from "../client";

/** Send a private, generic digest once each day; event text is never emailed. */
export const notificationEmailDigest = inngest.createFunction(
  { id: "notification-email-digest", retries: 3 },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    const result = await step.run("send-daily-digest", () => runDailyDigest());
    return {
      skipped: result.skipped,
      reason: result.reason,
      recipients: result.sent,
    };
  },
);
