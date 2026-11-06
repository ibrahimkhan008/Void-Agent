import { createHash } from "node:crypto";
import { z } from "zod";

export const zendeskCommentApprovalSchema = z.object({
  ticketId: z.string().trim().regex(/^[1-9][0-9]{0,19}$/),
  comment: z.string().trim().min(1).max(10_000),
}).strict();

export type ZendeskCommentApproval = z.infer<typeof zendeskCommentApprovalSchema>;

export const hashZendeskCommentApproval = (payload: ZendeskCommentApproval) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const hashZendeskApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
