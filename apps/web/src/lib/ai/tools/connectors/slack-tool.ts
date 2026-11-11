import { tool } from "ai";
import { z } from "zod";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_channels"),
      maxResults: z.number().int().min(1).max(100).optional().default(50),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_messages"),
      channelId: z.string().min(1).max(256),
      maxResults: z.number().int().min(1).max(100).optional().default(50),
      oldest: z.string().max(32).optional(),
      latest: z.string().max(32).optional(),
    })
    .strict(),
]);

export function createSlackToolForUser(userId: string) {
  return tool({
    description:
      "Read-only Slack for this signed-in user. List visible channels or recent messages in one channel. This tool does not post or modify messages.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        const result =
          input.action === "list_channels"
            ? await callConnectorApi(
                userId,
                "slack",
                "/api/conversations.list",
                {
                  query: {
                    limit: input.maxResults,
                    exclude_archived: "true",
                    types: "public_channel,private_channel,im,mpim",
                  },
                },
              )
            : await callConnectorApi(
                userId,
                "slack",
                "/api/conversations.history",
                {
                  query: {
                    channel: input.channelId,
                    limit: input.maxResults,
                    oldest: input.oldest,
                    latest: input.latest,
                  },
                },
              );
        if (result.ok !== true)
          throw new ConnectorApiError("Slack did not authorize this request");
        return input.action === "list_channels"
          ? {
              channels: Array.isArray(result.channels)
                ? result.channels.slice(0, input.maxResults)
                : [],
            }
          : {
              messages: Array.isArray(result.messages)
                ? result.messages.slice(0, input.maxResults)
                : [],
            };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Slack request failed",
        };
      }
    },
  });
}
