import "server-only";
import { notificationRepository } from "lib/db/repository";
import logger from "logger";
import { sendPushToUser } from "./web-push";

export const notifyScheduledRun = async (input: { userId: string; runId: string; jobName: string; threadId: string; failed: boolean }) => {
  try {
    const title = input.failed ? `Scheduled run failed: ${input.jobName}` : `Scheduled run complete: ${input.jobName}`;
    const body = input.failed ? "Open the scheduled run to review its status." : "Your scheduled assistant run has finished.";
    const notification = await notificationRepository.create({ userId: input.userId, type: input.failed ? "scheduled_run_failed" : "scheduled_run_completed", title, body, href: `/chat/${input.threadId}`, dedupeKey: `scheduled-run:${input.runId}` });
    if (notification) await sendPushToUser(input.userId, { title, body, href: `/chat/${input.threadId}` });
  } catch (error) {
    // Delivery must not alter the recorded scheduler outcome.
    logger.warn(`[scheduler] could not create run notification ${input.runId}:`, error);
  }
};
