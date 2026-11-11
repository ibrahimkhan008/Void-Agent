import { tool } from "ai";
import { ConnectorApiError } from "lib/connectors/provider-api";
import { callZulipApi } from "lib/connectors/zulip";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { z } from "zod";

const approvalToken = z.string().min(43).max(43);
const streamName = z.string().min(1).max(256);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_streams"),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_messages"),
      stream: streamName,
      topic: z.string().min(1).max(256).optional(),
      anchor: z.string().min(1).max(64).optional(),
      numBefore: z.number().int().min(1).max(100).optional().default(20),
      numAfter: z.number().int().min(0).max(100).optional().default(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("send_message"),
      stream: streamName,
      topic: z.string().min(1).max(256),
      content: z.string().min(1).max(20_000),
      approvalToken,
    })
    .strict(),
]);

export function createZulipToolForUser(userId: string) {
  return tool({
    description:
      "Zulip for this signed-in user. List streams or read recent messages in a stream/topic. Sending a message is an external write: first propose the exact stream/topic/content with proposeConnectorAction and wait for explicit approval, then execute only with its matching one-use approvalToken. Requests always go to the realm host pinned at credential setup.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_streams") {
          const result = await callZulipApi(userId, "/api/v1/streams");
          return { streams: boundedArray(result.streams, input.limit) };
        }
        if (input.action === "list_messages") {
          const narrow = [
            { operator: "stream", operand: input.stream },
            ...(input.topic
              ? [{ operator: "topic", operand: input.topic }]
              : []),
          ];
          const result = await callZulipApi(userId, "/api/v1/messages", {
            query: {
              num_before: input.numBefore,
              num_after: input.numAfter,
              ...(input.anchor !== undefined ? { anchor: input.anchor } : {}),
              narrow: JSON.stringify(narrow),
            },
          });
          return {
            messages: boundedArray(
              result.messages,
              input.numBefore + input.numAfter,
            ),
          };
        }
        const payload = {
          stream: input.stream,
          topic: input.topic,
          content: input.content,
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "zulip",
            action: "send_message",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Zulip message has not been approved or its approval expired",
          );
        const result = await callZulipApi(userId, "/api/v1/messages", {
          method: "POST",
          body: {
            type: "stream",
            to: input.stream,
            topic: input.topic,
            content: input.content,
          },
        });
        return {
          success: true,
          messageId: typeof result.id === "number" ? result.id : null,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Zulip action failed",
        };
      }
    },
  });
}

function boundedArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
