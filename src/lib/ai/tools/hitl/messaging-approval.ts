import { createHash } from "node:crypto";
import { z } from "zod";

export const messagingApprovalSchema = z.object({
  provider: z.enum(["teams", "discord", "zulip"]),
  destination: z.string().trim().min(1).max(256),
  content: z.string().trim().min(1).max(4000),
  topic: z.string().trim().min(1).max(100).optional(),
}).strict().superRefine((payload, ctx) => {
  if (payload.provider === "discord" && !/^\d{5,25}$/.test(payload.destination)) {
    ctx.addIssue({ code: "custom", path: ["destination"], message: "Discord destination must be a channel ID." });
  }
  if (payload.provider === "zulip" && !payload.topic) {
    ctx.addIssue({ code: "custom", path: ["topic"], message: "Zulip messages require an explicit topic." });
  }
  if (payload.provider !== "zulip" && payload.topic !== undefined) {
    ctx.addIssue({ code: "custom", path: ["topic"], message: "Topic is only valid for Zulip." });
  }
  if (payload.provider === "discord" && payload.content.length > 2000) {
    ctx.addIssue({ code: "too_big", maximum: 2000, inclusive: true, origin: "string", path: ["content"], message: "Discord messages are limited to 2,000 characters." });
  }
});

export type MessagingApproval = z.infer<typeof messagingApprovalSchema>;
export const hashMessagingApproval = (payload: MessagingApproval) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const hashMessagingApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
