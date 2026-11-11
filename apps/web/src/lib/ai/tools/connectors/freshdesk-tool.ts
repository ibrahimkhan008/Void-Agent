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
        .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
        .optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z.object({ action: z.literal("get_ticket"), ticketId }).strict(),
  z
    .object({
      action: z.literal("create_ticket"),
      name: z.string().min(1).max(256),
      email: z.string().email().max(320),
      subject: z.string().min(1).max(500),
      description: z.string().min(1).max(20_000),
      status: z
        .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
        .default(2),
      priority: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .default(1),
      source: z.literal(2).default(2),
      approvalToken,
    })
    .strict(),
  z
    .object({
      action: z.literal("add_reply"),
      ticketId,
      body: z.string().min(1).max(20_000),
      approvalToken,
    })
    .strict(),
]);

export function createFreshdeskToolForUser(userId: string) {
  return tool({
    description:
      "Freshdesk for the signed-in user. List/read tickets. Creating a ticket or sending a reply is an external write: first propose the exact Freshdesk payload with proposeConnectorAction and wait for explicit approval, then execute only with its matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_tickets") {
          const result = await callConnectorApi(
            userId,
            "freshdesk",
            "/api/v2/tickets",
            {
              query: {
                per_page: input.limit,
                ...(input.status ? { status: input.status } : {}),
              },
            },
          );
          return { tickets: boundedArray(result, input.limit) };
        }
        if (input.action === "get_ticket")
          return await callConnectorApi(
            userId,
            "freshdesk",
            `/api/v2/tickets/${input.ticketId}`,
          );
        if (input.action === "create_ticket") {
          const payload = {
            name: input.name,
            email: input.email,
            subject: input.subject,
            description: input.description,
            status: input.status,
            priority: input.priority,
            source: input.source,
          };
          const approved = await connectorActionApprovalRepository.consume(
            userId,
            input.approvalToken,
            { provider: "freshdesk", action: "create_ticket", payload },
          );
          if (!approved)
            throw new ConnectorApiError(
              "This exact Freshdesk ticket has not been approved or its approval expired",
            );
          const result = await callConnectorApi(
            userId,
            "freshdesk",
            "/api/v2/tickets",
            { method: "POST", body: payload },
          );
          return { success: true, ticket: result };
        }
        const payload = { ticketId: input.ticketId, body: input.body };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          { provider: "freshdesk", action: "add_reply", payload },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Freshdesk reply has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "freshdesk",
          `/api/v2/tickets/${input.ticketId}/reply`,
          { method: "POST", body: { body: input.body } },
        );
        return { success: true, reply: result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Freshdesk action failed",
        };
      }
    },
  });
}

function boundedArray(
  value: Record<string, unknown>,
  limit: number,
): unknown[] {
  return Array.isArray(value.tickets) ? value.tickets.slice(0, limit) : [];
}
