import "server-only";

import { notificationRepository } from "lib/db/repository";
import { listProjectNotificationRecipientIds } from "lib/projects/recipients";
import logger from "logger";
import { sendPushToUser } from "./web-push";

/** Notify current project members when a source run adds reviewable proposals. */
export async function notifyProjectBrainRunCompleted(input: {
  projectId: string;
  runId: string;
  factCount: number;
  todoCount: number;
}): Promise<{ inserted: number }> {
  const factCount = Number.isSafeInteger(input.factCount)
    ? Math.max(0, Math.min(input.factCount, 80))
    : 0;
  const todoCount = Number.isSafeInteger(input.todoCount)
    ? Math.max(0, Math.min(input.todoCount, 15))
    : 0;
  if (!factCount && !todoCount) return { inserted: 0 };

  try {
    const recipients = await listProjectNotificationRecipientIds(
      input.projectId,
    );
    if (!recipients.length) return { inserted: 0 };

    const title = "Project knowledge is ready for review";
    const body = `${factCount} knowledge proposal(s) and ${todoCount} action item(s) were added. Review them before accepting.`;
    const href = `/projects/${encodeURIComponent(input.projectId)}`;
    const dedupeKey = `project-brain-run:${input.runId}`;
    const results = await Promise.allSettled(
      [...new Set(recipients)].map(async (userId) => {
        const created = await notificationRepository.createIfNew({
          userId,
          type: "project_brain_run_completed",
          title,
          body,
          href,
          dedupeKey,
        });
        if (!created) return false;
        try {
          // Subscription presence is the user's explicit web-push opt-in.
          // In-app notification persistence remains authoritative.
          await sendPushToUser(userId, { title, body, href });
        } catch (error) {
          logger.warn("[project-brain] run completion push failed", error);
        }
        return true;
      }),
    );

    let inserted = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) inserted += 1;
      if (result.status === "rejected") {
        logger.warn(
          "[project-brain] run completion notification creation failed",
          result.reason,
        );
      }
    }
    return { inserted };
  } catch (error) {
    // Notifications are best-effort; they must never change extraction state.
    logger.warn("[project-brain] run completion notification failed", error);
    return { inserted: 0 };
  }
}
