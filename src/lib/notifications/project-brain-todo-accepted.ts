import "server-only";

import { notificationRepository } from "lib/db/repository";
import { listProjectNotificationRecipientIds } from "lib/projects/recipients";
import logger from "logger";
import { sendPushToUser } from "./web-push";

/**
 * Notify current project recipients after a reviewer accepts a proposed todo.
 * The notification intentionally omits model-generated title/evidence text.
 */
export async function notifyAcceptedProjectBrainTodo(input: {
  projectId: string;
  todoId: string;
}): Promise<{ inserted: number }> {
  try {
    const recipients = await listProjectNotificationRecipientIds(
      input.projectId,
    );
    if (!recipients.length) return { inserted: 0 };

    const title = "Project action item accepted";
    const body = "A reviewed action item was accepted in this project.";
    const href = `/projects/${encodeURIComponent(input.projectId)}`;
    const dedupeKey = `project-brain-todo-accepted:${input.todoId}`;
    const results = await Promise.allSettled(
      recipients.map(async (userId) => {
        const created = await notificationRepository.createIfNew({
          userId,
          type: "project_brain_todo_accepted",
          title,
          body,
          href,
          dedupeKey,
        });
        if (!created) return false;
        try {
          await sendPushToUser(userId, { title, body, href });
        } catch (error) {
          logger.warn(
            "[project-brain] accepted todo push notification failed",
            error,
          );
        }
        return true;
      }),
    );

    let inserted = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) inserted++;
      if (result.status === "rejected") {
        logger.warn(
          "[project-brain] accepted todo notification creation failed",
          result.reason,
        );
      }
    }
    return { inserted };
  } catch (error) {
    // Notification delivery is best-effort and cannot roll back review state.
    logger.warn(
      "[project-brain] accepted todo notification workflow failed",
      error,
    );
    return { inserted: 0 };
  }
}
