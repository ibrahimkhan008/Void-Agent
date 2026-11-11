import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { z } from "zod";

const approvalToken = z.string().min(43).max(43);
const ticketId = z.string().regex(/^[1-9][0-9]{0,18}$/);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_tickets"),
      status: z
        .enum(["new", "open", "pending", "hold", "solved", "closed"])
        .optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z.object({ action: z.literal("get_ticket"), ticketId }).strict(),
  z
    .object({
      action: z.literal("search"),
      query: z.string().min(1).max(500),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("add_comment"),
      ticketId,
      comment: z.string().min(1).max(20_000),
      approvalToken,
    })
    .strict(),
]);

export function createZendeskToolForUser(userId: string) {
  return tool({
    description:
      "Zendesk for the signed-in user. List/search/read tickets. Adding a comment requires proposing the exact ticketId/comment and user approval, then a matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_tickets") {
          const result = await callConnectorApi(
            userId,
            "zendesk",
            "/api/v2/tickets.json",
            {
              query: {
                per_page: input.limit,
                ...(input.status
                  ? { status: zendeskStatus(input.status) }
                  : {}),
              },
            },
          );
          return { tickets: sliceArray(result.tickets, input.limit) };
        }
        if (input.action === "get_ticket") {
          return await callConnectorApi(
            userId,
            "zendesk",
            `/api/v2/tickets/${input.ticketId}.json`,
          );
        }
        if (input.action === "search") {
          const result = await callConnectorApi(
            userId,
            "zendesk",
            "/api/v2/search.json",
            {
              query: {
                query: `type:ticket ${input.query}`,
                per_page: input.limit,
              },
            },
          );
          return { results: sliceArray(result.results, input.limit) };
        }
        const payload = { ticketId: input.ticketId, comment: input.comment };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          { provider: "zendesk", action: "add_comment", payload },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Zendesk comment has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "zendesk",
          `/api/v2/tickets/${input.ticketId}.json`,
          {
            method: "PUT",
            body: {
              ticket: { comment: { body: input.comment, public: false } },
            },
          },
        );
        return { success: true, ticket: result.ticket ?? result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Zendesk action failed",
        };
      }
    },
  });
}

function zendeskStatus(
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed",
): number {
  return { new: 0, open: 1, pending: 2, hold: 3, solved: 4, closed: 5 }[status];
}

function sliceArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
