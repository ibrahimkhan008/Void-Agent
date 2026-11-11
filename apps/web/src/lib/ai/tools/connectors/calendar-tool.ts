import { tool } from "ai";
import { z } from "zod";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      maxResults: z.number().int().min(1).max(20).optional().default(10),
      timeMin: z.string().datetime().optional(),
      timeMax: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("get"), eventId: z.string().min(1).max(256) })
    .strict(),
]);

export function createCalendarToolForUser(userId: string) {
  return tool({
    description:
      "Read-only Google Calendar for this signed-in user. List upcoming events with a bounded count or get one event by its id. This tool does not create or modify events.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "get") {
          return await callConnectorApi(
            userId,
            "google-calendar",
            `/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
          );
        }
        const result = await callConnectorApi(
          userId,
          "google-calendar",
          "/calendar/v3/calendars/primary/events",
          {
            query: {
              maxResults: input.maxResults,
              timeMin: input.timeMin ?? new Date().toISOString(),
              timeMax: input.timeMax,
              orderBy: "startTime",
              singleEvents: "true",
            },
          },
        );
        return {
          events: Array.isArray(result.items)
            ? result.items.slice(0, input.maxResults)
            : [],
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Calendar request failed",
        };
      }
    },
  });
}
