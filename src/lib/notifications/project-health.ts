import "server-only";

import { createHash } from "node:crypto";
import { notificationRepository } from "lib/db/repository";
import type { ProjectBrainHealth } from "lib/projects/project-brain-health";
import { listProjectNotificationRecipientIds } from "lib/projects/recipients";
import logger from "logger";
import { sendPushToUser } from "./web-push";

/** Notify currently authorized project users only when known health changes. */
export async function notifyProjectHealthTransition(input: {
  projectId: string;
  inputFingerprint: string;
  previousHealth: ProjectBrainHealth | null;
  health: ProjectBrainHealth;
}): Promise<{ inserted: number }> {
  const { projectId, previousHealth, health } = input;
  if (!previousHealth || health === "unknown" || previousHealth === health) {
    return { inserted: 0 };
  }

  try {
    const recipients = await listProjectNotificationRecipientIds(projectId);
    if (!recipients.length) return { inserted: 0 };

    const title = "Project status changed";
    const body = `Project health moved from ${previousHealth} to ${health}. Open the project to review its latest status.`;
    const href = `/projects/${encodeURIComponent(projectId)}`;
    const transitionKey = createHash("sha256")
      .update(`${input.inputFingerprint}:${previousHealth}:${health}`)
      .digest("hex")
      .slice(0, 32);
    const dedupeKey = `project-health:${projectId}:${transitionKey}`;

    let inserted = 0;
    const results = await Promise.allSettled(
      recipients.map(async (userId) => {
        const notification = await notificationRepository.createIfNew({
          userId,
          type: "project_health_changed",
          title,
          body,
          href,
          dedupeKey,
        });
        if (!notification) return false;
        try {
          await sendPushToUser(userId, { title, body, href });
        } catch (error) {
          logger.warn("[project-brain] health notification push failed", error);
        }
        return true;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) inserted += 1;
      if (result.status === "rejected") {
        logger.warn(
          "[project-brain] health notification creation failed",
          result.reason,
        );
      }
    }
    return { inserted };
  } catch (error) {
    logger.warn("[project-brain] health notification workflow failed", error);
    return { inserted: 0 };
  }
}
