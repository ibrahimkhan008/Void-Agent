import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { messagingApprovalSchema } from "lib/ai/tools/hitl/messaging-approval";
import { getTokenProviderToken } from "lib/connectors/credentials";
import { pgDb as db } from "lib/db/pg/db.pg";
import { messagingApprovalRepository } from "lib/db/pg/repositories/messaging-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum(["list_streams", "list_messages", "send_message"]),
  stream: z.string().optional().describe("Stream name or ID"),
  topic: z.string().optional().describe("Topic name (default: empty)"),
  content: z.string().max(4000).optional().describe("Message content (for send_message)"),
  approvalToken: z.string().min(40).max(128).optional(),
  anchor: z.union([z.string(), z.number()]).optional().describe("Message ID to anchor around (for list_messages)"),
  numBefore: z.number().min(1).max(100).optional().default(20),
  numAfter: z.number().min(1).max(100).optional().default(0),
});

interface ZulipToolInput {
  action: "list_streams" | "list_messages" | "send_message";
  stream?: string;
  topic?: string;
  content?: string;
  approvalToken?: string;
  anchor?: string | number;
  numBefore?: number;
  numAfter?: number;
}

function getBaseUrl(): string {
  return process.env.ZULIP_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("zulip");
  const user = process.env.ZULIP_USER_EMAIL?.trim();
  if (!token || !user) return null;
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "zulip"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createZulipToolForUser(userId: string): Tool {
  return createTool({
    description: `Zulip integration tool (server-token).

Actions:
- list_streams: List streams.
- list_messages: List messages in a stream/topic.
- send_message: Send a message only with the exact approvalToken from proposeExternalMessage after user review (requires: stream, topic, content).`,
    inputSchema,
    execute: async (input: ZulipToolInput) => {
      try {
        const { action } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return {
            error:
              "Zulip is not configured. Set ZULIP_BASE_URL, ZULIP_USER_EMAIL, ZULIP_API_TOKEN.",
          };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Zulip is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth, "Content-Type": "application/json" };

        if (action === "list_streams") {
          const res = await fetch(`${base}/api/v1/streams`, { headers });
          return await res.json();
        }
        if (action === "list_messages") {
          if (!input.stream) return { error: "stream required" };
          const params = new URLSearchParams({
            num_before: String(input.numBefore ?? 20),
            num_after: String(input.numAfter ?? 0),
          });
          if (input.anchor !== undefined) params.set("anchor", String(input.anchor));
          if (input.stream) params.set("narrow", JSON.stringify([{ operator: "stream", operand: input.stream }]));
          if (input.topic) params.set("narrow", JSON.stringify([{ operator: "stream", operand: input.stream }, { operator: "topic", operand: input.topic }]));
          const res = await fetch(`${base}/api/v1/messages?${params}`, { headers });
          return await res.json();
        }
        if (action === "send_message") {
          if (!input.stream || !input.content || !input.approvalToken) {
            return { error: "stream, content, and approvalToken required" };
          }
          const approval = messagingApprovalSchema.safeParse({ provider: "zulip", destination: input.stream, topic: input.topic || "general", content: input.content });
          if (!approval.success || approval.data.provider !== "zulip") return { error: "Invalid Zulip message approval payload." };
          if (!(await messagingApprovalRepository.consume(userId, input.approvalToken, approval.data))) {
            return { error: "Zulip message requires a fresh approval for this exact stream, topic, and text." };
          }
          const res = await fetch(`${base}/api/v1/messages`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              type: "stream",
              to: approval.data.destination,
              topic: approval.data.topic,
              content: approval.data.content,
            }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Zulip tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Zulip operation failed.",
        };
      }
    },
  });
}

export const zulipTool = createTool({
  description: "Zulip tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Zulip tool requires user context." }),
});
