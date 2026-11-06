import { createHash } from "node:crypto";
import { z } from "zod";

export const taskCreationApprovalSchema = z.object({
  provider: z.enum(["asana", "clickup", "productboard"]),
  targetId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/),
  name: z.string().trim().min(1).max(500),
  details: z.string().trim().max(20_000),
}).strict();

export type TaskCreationApproval = z.infer<typeof taskCreationApprovalSchema>;
export const hashTaskCreationApproval = (payload: TaskCreationApproval) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const hashTaskApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
