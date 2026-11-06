import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { zendeskCommentApprovalSchema } from "lib/ai/tools/hitl/zendesk-approval";
import { refreshConnectorToken } from "lib/connectors/refresh";
import { pgDb as db } from "lib/db/pg/db.pg";
import { zendeskApprovalRepository } from "lib/db/pg/repositories/zendesk-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum(["list_tickets", "get_ticket", "search", "add_comment"]),
  ticketId: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  status: z.string().optional().describe("Filter by status (new, open, pending, hold, solved, closed)"),
  comment: z.string().optional().describe("Comment body (for add_comment)"),
  approvalToken: z.string().min(40).max(128).optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface ZendeskToolInput {
  action: "list_tickets" | "get_ticket" | "search" | "add_comment";
  ticketId?: string | number;
  query?: string;
  status?: string;
  comment?: string;
  approvalToken?: string;
  limit?: number;
}

function getBaseUrl(): string {
  const subdomain = process.env.ZENDESK_SUBDOMAIN || "";
  return subdomain ? `https://${subdomain}.zendesk.com/api/v2` : "";
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "zendesk"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("zendesk", rows[0]);
}

export function createZendeskToolForUser(userId: string): Tool {
  return createTool({
    description: `Zendesk integration tool.

Actions:
- list_tickets: List tickets (optional: status).
- get_ticket: Read a ticket (requires: ticketId).
- search: Search tickets by query.
- add_comment: Add a comment only with the exact single-use approvalToken returned by proposeZendeskComment after user review (requires: ticketId, comment).`,
    inputSchema,
    execute: async (input: ZendeskToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        if (!base) return { error: "Zendesk is not configured (ZENDESK_SUBDOMAIN missing)." };
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Zendesk is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list_tickets") {
          const url = input.status
            ? `${base}/tickets.json?status=${input.status}&per_page=${limit}`
            : `${base}/tickets.json?per_page=${limit}`;
          const res = await fetch(url, { headers });
          return await res.json();
        }
        if (action === "get_ticket") {
          if (!input.ticketId) return { error: "ticketId required" };
          const res = await fetch(`${base}/tickets/${input.ticketId}.json`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/search.json?query=${encodeURIComponent(input.query)}&per_page=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "add_comment") {
          if (input.ticketId === undefined || !input.comment || !input.approvalToken) {
            return { error: "ticketId and comment required" };
          }
          const approval = zendeskCommentApprovalSchema.safeParse({ ticketId: String(input.ticketId), comment: input.comment });
          if (!approval.success) return { error: "Invalid Zendesk comment approval payload." };
          const approved = await zendeskApprovalRepository.consume(userId, input.approvalToken, approval.data);
          if (!approved) return { error: "Zendesk comment requires a fresh approval for these exact fields." };
          const res = await fetch(`${base}/tickets/${approval.data.ticketId}.json`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ ticket: { comment: { body: approval.data.comment } } }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Zendesk tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Zendesk operation failed.",
        };
      }
    },
  });
}

export const zendeskTool = createTool({
  description: "Zendesk tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Zendesk tool requires user context." }),
});
