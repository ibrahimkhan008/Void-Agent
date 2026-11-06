import { describe, expect, it } from "vitest";
import {
  calendarApprovalPayloadSchema,
  hashCalendarApprovalPayload,
} from "./calendar-approval";

describe("calendar effect approval contract", () => {
  it("accepts bounded event mutations and rejects invalid ranges or extra fields", () => {
    const event = {
      action: "create_event",
      summary: "Planning meeting",
      start: "2026-06-03T10:00:00+05:30",
      end: "2026-06-03T11:00:00+05:30",
    };
    expect(calendarApprovalPayloadSchema.safeParse(event).success).toBe(true);
    expect(calendarApprovalPayloadSchema.safeParse({
      ...event,
      end: "2026-06-03T09:00:00+05:30",
    }).success).toBe(false);
    expect(calendarApprovalPayloadSchema.safeParse({ ...event, arbitrary: "field" }).success).toBe(false);
  });

  it("binds the approval digest to the exact event action and values", () => {
    const event = {
      action: "update_event" as const,
      eventId: "event-1",
      summary: "Planning meeting",
      start: "2026-06-03T10:00:00+05:30",
      end: "2026-06-03T11:00:00+05:30",
    };
    expect(hashCalendarApprovalPayload(event)).not.toBe(
      hashCalendarApprovalPayload({ ...event, summary: "Changed meeting" }),
    );
    expect(hashCalendarApprovalPayload(event)).not.toBe(
      hashCalendarApprovalPayload({ ...event, action: "create_event", eventId: undefined } as never),
    );
  });
});
