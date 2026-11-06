import { createHash } from "node:crypto";
import { z } from "zod";

const common = {
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(500).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().trim().min(1).max(12_000),
};

export const emailApprovalPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), ...common }).strict(),
  z.object({
    action: z.literal("reply"),
    messageId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,256}$/),
    ...common,
  }).strict(),
]);

export type EmailApprovalPayload = z.infer<typeof emailApprovalPayloadSchema>;

export function hashEmailApprovalPayload(payload: EmailApprovalPayload) {
  const canonical = payload.action === "send"
    ? { action: payload.action, to: payload.to, subject: payload.subject, body: payload.body }
    : { action: payload.action, messageId: payload.messageId, to: payload.to, subject: payload.subject, body: payload.body };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function hashEmailApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
