import "server-only";

import { createHash } from "node:crypto";
import { tool as createTool, jsonSchema } from "ai";
import { DefaultToolName } from "lib/ai/tools";
import { notificationRepository } from "lib/db/repository";
import { safeNotificationHref } from "lib/notifications/contracts";
import { sendPushToUser } from "lib/notifications/web-push";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

const CockpitUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(500).optional(),
    severity: z.enum(["info", "warning", "alert"]).default("info"),
    href: z
      .string()
      .max(512)
      .refine((value) => safeNotificationHref(value) !== null)
      .optional(),
  })
  .strict();

type CockpitUpdate = z.infer<typeof CockpitUpdateSchema>;

export function notificationUpdateDedupeKey(
  input: CockpitUpdate,
  now = Date.now(),
) {
  const digest = createHash("sha256")
    .update(
      `${input.title}\n${input.body ?? ""}\n${input.href ?? ""}\n${input.severity}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `agent-update:${digest}:${Math.floor(now / 60_000)}`;
}

export function createCockpitPushUpdateToolForUser(
  userId: string,
  threadId?: string,
) {
  return createTool({
    description:
      "Post a concise update to the user's own notification inbox and, if configured, their browser push. Use after meaningful work completes or when an important anomaly needs attention. Keep lock-screen text brief and free of sensitive details. This never sends notifications to other users.",
    inputSchema: jsonSchema<CockpitUpdate>({
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120 },
        body: { type: "string", maxLength: 500 },
        severity: { type: "string", enum: ["info", "warning", "alert"] },
        href: {
          type: "string",
          maxLength: 512,
          description: "Optional in-app path beginning with a single slash.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    }),
    execute: async (rawInput) => {
      const parsed = CockpitUpdateSchema.safeParse(rawInput);
      if (!parsed.success) return { posted: false, error: "Invalid update." };
      const input = parsed.data;
      const rate = await checkApiRateLimit({
        kind: "agent-notification-update",
        id: userId,
        limit: 12,
        windowMs: 60_000,
      });
      if (!rate.allowed)
        return { posted: false, error: "Update limit reached." };

      const href =
        input.href ??
        (threadId ? `/chat/${encodeURIComponent(threadId)}` : "/notifications");
      const notification = await notificationRepository.createIfNew({
        userId,
        type: `agent_update_${input.severity}`,
        title: input.title,
        body: input.body ?? "",
        href,
        dedupeKey: notificationUpdateDedupeKey({ ...input, href }),
      });
      if (!notification) return { posted: false, duplicate: true };

      try {
        await sendPushToUser(userId, {
          title: input.title,
          body: input.body ?? "",
          href,
        });
      } catch {
        // The notification row is durable; push is best effort.
      }

      return { posted: true, id: notification.id, severity: input.severity };
    },
  });
}

export const CockpitPushUpdateToolName = DefaultToolName.CockpitPushUpdate;
