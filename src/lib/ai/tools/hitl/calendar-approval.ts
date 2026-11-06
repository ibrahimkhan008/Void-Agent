import { createHash } from "node:crypto";
import { z } from "zod";

const eventFields = {
  summary: z.string().trim().min(1).max(300),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(4000).optional(),
  location: z.string().max(500).optional(),
};

export const calendarApprovalPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_event"), ...eventFields }).strict(),
  z.object({
    action: z.literal("update_event"),
    eventId: z.string().trim().min(1).max(256),
    ...eventFields,
  }).strict(),
  z.object({
    action: z.literal("delete_event"),
    eventId: z.string().trim().min(1).max(256),
    summary: z.string().trim().min(1).max(300),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  }).strict(),
]).superRefine((payload, ctx) => {
  if (payload.action !== "delete_event" && Date.parse(payload.start) >= Date.parse(payload.end)) {
    ctx.addIssue({ code: "custom", path: ["end"], message: "Event end must be later than start." });
  }
});

export type CalendarApprovalPayload = z.infer<typeof calendarApprovalPayloadSchema>;

export function hashCalendarApprovalPayload(payload: CalendarApprovalPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function hashCalendarApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
