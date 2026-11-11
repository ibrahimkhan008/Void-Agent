import { tool } from "ai";
import { z } from "zod";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("inbox"),
      maxResults: z.number().int().min(1).max(20).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("read"),
      messageId: z.string().min(1).max(256),
    })
    .strict(),
]);

export function createOutlookToolForUser(userId: string) {
  return tool({
    description:
      "Read-only Outlook mail for this signed-in user. List recent inbox messages or read one by id. This tool does not send, delete, or modify mail.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "read") {
          const result = await callConnectorApi(
            userId,
            "outlook",
            `/v1.0/me/messages/${encodeURIComponent(input.messageId)}`,
            {
              query: {
                $select:
                  "id,subject,from,toRecipients,receivedDateTime,body,isRead",
              },
            },
          );
          const body =
            result.body && typeof result.body === "object"
              ? (result.body as Record<string, unknown>)
              : {};
          const text = typeof body.content === "string" ? body.content : "";
          return {
            ...result,
            body:
              body.contentType === "html"
                ? stripHtml(text)
                : text.slice(0, 20_000),
          };
        }
        const result = await callConnectorApi(
          userId,
          "outlook",
          "/v1.0/me/messages",
          {
            query: {
              $top: input.maxResults,
              $select:
                "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead",
              $orderby: "receivedDateTime desc",
            },
          },
        );
        return {
          messages: Array.isArray(result.value)
            ? result.value.slice(0, input.maxResults)
            : [],
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Outlook request failed",
        };
      }
    },
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 20_000);
}
