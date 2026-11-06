import { createHash } from "node:crypto";
import { z } from "zod";

const ticketIdSchema = z.string().trim().regex(/^[1-9][0-9]{0,19}$/);
export const freshdeskEffectApprovalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_ticket"),
    subject: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(20_000),
    requesterName: z.string().trim().min(1).max(200),
    requesterEmail: z.string().trim().email().max(320),
    status: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }).strict(),
  z.object({
    action: z.literal("add_reply"),
    ticketId: ticketIdSchema,
    body: z.string().trim().min(1).max(20_000),
  }).strict(),
]);

export type FreshdeskEffectApproval = z.infer<typeof freshdeskEffectApprovalSchema>;

export const hashFreshdeskEffectApproval = (payload: FreshdeskEffectApproval) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const hashFreshdeskApprovalToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const freshdeskProposalInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_ticket"), subject: z.string().min(1).max(500), description: z.string().min(1).max(20_000), requesterName: z.string().min(1).max(200), requesterEmail: z.string().email().max(320), status: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(2), priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1) }).strict(),
  z.object({ action: z.literal("add_reply"), ticketId: ticketIdSchema, body: z.string().min(1).max(20_000) }).strict(),
]);
