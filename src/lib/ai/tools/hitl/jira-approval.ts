import { createHash } from "node:crypto";
import { z } from "zod";

export const jiraCommentApprovalSchema = z.object({
  issueKey: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]{0,8}$/),
  comment: z.string().trim().min(1).max(10_000),
}).strict();

export type JiraCommentApproval = z.infer<typeof jiraCommentApprovalSchema>;

export const hashJiraCommentApproval = (payload: JiraCommentApproval) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const hashJiraApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
