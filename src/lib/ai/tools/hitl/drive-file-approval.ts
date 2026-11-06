import { createHash } from "node:crypto";
import { z } from "zod";

export const driveFileApprovalSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => !/[\u0000-\u001F\u007F]/.test(value)),
  content: z.string().max(50_000),
}).strict();

export type DriveFileApproval = z.infer<typeof driveFileApprovalSchema>;
export const hashDriveFileApproval = (payload: DriveFileApproval) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const hashDriveApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");
