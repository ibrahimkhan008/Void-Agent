import { createHash } from "node:crypto";
import { z } from "zod";

export const linearIssueApprovalSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).optional(),
}).strict();

export type LinearIssueApproval = z.infer<typeof linearIssueApprovalSchema>;

export const hashLinearIssueApproval = (payload: LinearIssueApproval) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const hashLinearIssueApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
