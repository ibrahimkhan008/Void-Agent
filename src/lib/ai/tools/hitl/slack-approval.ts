import { createHash } from "node:crypto";
import { z } from "zod";

export const slackMessageApprovalSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(4000),
}).strict();

export type SlackMessageApproval = z.infer<typeof slackMessageApprovalSchema>;
export const hashSlackMessageApproval = (payload: SlackMessageApproval) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const hashSlackApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
