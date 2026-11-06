import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { calendarApprovalPayloadSchema } from "lib/ai/tools/hitl/calendar-approval";
import { refreshConnectorToken } from "lib/connectors/refresh";
import { pgDb as db } from "lib/db/pg/db.pg";
import { calendarApprovalRepository } from "lib/db/pg/repositories/calendar-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const eventWriteFields = {
  approvalToken: z.string().min(32).max(128).optional(),
  summary: z.string().trim().min(1).max(300).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(4000).optional(),
  location: z.string().max(500).optional(),
};
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), maxResults: z.number().min(1).max(50).optional() }).strict(),
  z.object({ action: z.literal("get"), eventId: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("create_event"), ...eventWriteFields }).strict(),
  z.object({ action: z.literal("update_event"), eventId: z.string().min(1).max(256), ...eventWriteFields }).strict(),
  z.object({
    action: z.literal("delete_event"),
    eventId: z.string().min(1).max(256),
    summary: z.string().trim().min(1).max(300),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    approvalToken: z.string().min(32).max(128).optional(),
  }).strict(),
]);
type CalendarToolInput = z.infer<typeof inputSchema>;

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "google-calendar"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("google-calendar", rows[0]);
}

export function createCalendarToolForUser(userId: string): Tool {
  return createTool({
    description: `Google Calendar integration tool.

Actions:
- list: List upcoming events (optional: maxResults 1-50, default 10).
- get: Get a specific event's full details (requires: eventId from list results).
- create_event: Create an event only with the approvalToken returned from proposeCalendarChange.
- update_event: Replace an event's reviewed summary, time, and optional details. Requires a fresh approvalToken.
- delete_event: Delete the exact reviewed event. Requires eventId, expected summary/start/end, and a fresh approvalToken; the tool verifies the event still matches before deletion.

IMPORTANT:
- User must connect Google Calendar first via the Connectors menu.
- For 'get', the eventId must come from a previous 'list' call.`,
    inputSchema,
    execute: async (input: CalendarToolInput) => {
      try {
        const action = input.action;
        const eventId = "eventId" in input ? input.eventId : undefined;
        const maxResults = input.action === "list" ? input.maxResults ?? 10 : 10;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Google Calendar is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        if (action === "get") {
          if (!eventId) {
            return { error: "eventId is required for the get action" };
          }
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/events/${encodeURIComponent(eventId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) {
            return { error: "Failed to fetch event" };
          }
          const event = await res.json();
          return { event };
        }

        if (action === "create_event" || action === "update_event" || action === "delete_event") {
          const { approvalToken, ...effectInput } = input;
          const effect = calendarApprovalPayloadSchema.safeParse(effectInput);
          if (!approvalToken || !effect.success) {
            return { error: "This calendar change needs a valid user-reviewed approval. Use proposeCalendarChange first." };
          }

          const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          };
          const baseUrl = "https://www.googleapis.com/calendar/v3/events";

          if (effect.data.action === "delete_event" || effect.data.action === "update_event") {
            const existingResponse = await fetch(`${baseUrl}/${encodeURIComponent(effect.data.eventId)}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!existingResponse.ok) return { error: "The reviewed calendar event could not be verified." };
            const existing = await existingResponse.json() as {
              summary?: string;
              start?: { dateTime?: string };
              end?: { dateTime?: string };
              etag?: string;
            };
            if (effect.data.action === "delete_event") {
              const matches = existing.summary === effect.data.summary
                && Date.parse(existing.start?.dateTime ?? "") === Date.parse(effect.data.start)
                && Date.parse(existing.end?.dateTime ?? "") === Date.parse(effect.data.end);
              if (!matches) return { error: "The event changed since it was reviewed. Ask the user to review the current event again." };
            }
            if (existing.etag) headers["If-Match"] = existing.etag;
          }

          const approved = await calendarApprovalRepository.consume(userId, approvalToken, effect.data);
          if (!approved) return { error: "This calendar change was not approved, has expired, or its reviewed fields changed." };

          const method = effect.data.action === "create_event" ? "POST" : effect.data.action === "update_event" ? "PATCH" : "DELETE";
          const url = effect.data.action === "create_event"
            ? baseUrl
            : `${baseUrl}/${encodeURIComponent(effect.data.eventId)}`;
          const eventBody = effect.data.action === "delete_event" ? undefined : {
            summary: effect.data.summary,
            ...(effect.data.description !== undefined ? { description: effect.data.description } : {}),
            ...(effect.data.location !== undefined ? { location: effect.data.location } : {}),
            start: { dateTime: effect.data.start, ...(effect.data.timeZone ? { timeZone: effect.data.timeZone } : {}) },
            end: { dateTime: effect.data.end, ...(effect.data.timeZone ? { timeZone: effect.data.timeZone } : {}) },
          };
          const response = await fetch(url, {
            method,
            headers,
            ...(eventBody ? { body: JSON.stringify(eventBody) } : {}),
          });
          if (!response.ok) return { error: "Google Calendar did not complete the approved change." };
          if (effect.data.action === "delete_event") return { deleted: true, eventId: effect.data.eventId };
          const event = await response.json();
          return { success: true, action: effect.data.action, event };
        }

        // list upcoming events
        const now = new Date().toISOString();
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          return { error: "Failed to list events" };
        }
        const data = (await res.json()) as { items?: any[] };
        return {
          events: (data.items || []).map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location,
            description: e.description,
            htmlLink: e.htmlLink,
          })),
          count: data.items?.length || 0,
        };
      } catch (error) {
        console.error("Calendar tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Calendar operation failed.",
        };
      }
    },
  });
}

export const calendarTool = createTool({
  description: "Google Calendar tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Calendar tool requires user context. This should not happen in normal operation.",
  }),
});
