import { tool } from "ai";
import { z } from "zod";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const approvalToken = z.string().min(43).max(43);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_chats"),
      maxResults: z.number().int().min(1).max(50).optional().default(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_chat_messages"),
      chatId: z.string().min(1).max(256),
      maxResults: z.number().int().min(1).max(50).optional().default(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("send_chat_message"),
      chatId: z.string().min(1).max(256),
      message: z.string().min(1).max(20_000),
      approvalToken,
    })
    .strict(),
]);

export function createTeamsToolForUser(userId: string) {
  return tool({
    description:
      "Microsoft Teams for this signed-in user. Safe actions: list chats and list messages in a chat. Sending a message is a write: first call proposeConnectorAction with provider teams, action send_chat_message and exact chatId/message, then call this action with that exact payload and one-use approvalToken after explicit approval.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "list_chats") {
          const result = await callConnectorApi(
            userId,
            "teams",
            "/v1.0/me/chats",
            {
              query: {
                $top: input.maxResults,
                $orderby: "lastUpdatedDateTime desc",
              },
            },
          );
          return {
            chats: Array.isArray(result.value)
              ? result.value.slice(0, input.maxResults)
              : [],
          };
        }
        if (input.action === "list_chat_messages") {
          const result = await callConnectorApi(
            userId,
            "teams",
            `/v1.0/me/chats/${encodeURIComponent(input.chatId)}/messages`,
            {
              query: {
                $top: input.maxResults,
                $orderby: "createdDateTime desc",
              },
            },
          );
          return {
            messages: Array.isArray(result.value)
              ? result.value.slice(0, input.maxResults)
              : [],
          };
        }
        const payload = { chatId: input.chatId, message: input.message };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "teams",
            action: "send_chat_message",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Teams action has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "teams",
          `/v1.0/me/chats/${encodeURIComponent(input.chatId)}/messages`,
          {
            method: "POST",
            body: { body: { contentType: "text", content: input.message } },
          },
        );
        return {
          success: true,
          messageId: typeof result.id === "string" ? result.id : undefined,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Teams request failed",
        };
      }
    },
  });
}
