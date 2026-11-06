import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { slackMessageApprovalSchema } from "lib/ai/tools/hitl/slack-approval";
import { refreshConnectorToken } from "lib/connectors/refresh";
import { pgDb as db } from "lib/db/pg/db.pg";
import { slackApprovalRepository } from "lib/db/pg/repositories/slack-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum(["list_channels", "list_messages", "send_message"]),
  channelId: z
    .string()
    .optional()
    .describe("Slack channel ID (for list_messages action)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of items to return (default 30)"),
  text: z.string().max(4000).optional().describe("Slack message (send_message only)"),
  approvalToken: z.string().min(40).max(128).optional(),
});

interface SlackToolInput {
  action: "list_channels" | "list_messages" | "send_message";
  channelId?: string;
  limit?: number;
  text?: string;
  approvalToken?: string;
}

const SLACK_API = "https://slack.com/api";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "slack"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("slack", rows[0]);
}

export function createSlackToolForUser(userId: string): Tool {
  return createTool({
    description: `Slack integration tool.

Actions:
- list_channels: List public and private channels the user belongs to (optional: limit 1-100, default 30).
- list_messages: List recent messages in a channel (requires: channelId from list_channels results, optional: limit).
- send_message: Post a message after the user reviews and approves the exact channel and text with proposeSlackMessage.

IMPORTANT:
- User must connect Slack first via the Connectors menu.`,
    inputSchema,
    execute: async (input: SlackToolInput) => {
      try {
        const { action, channelId, limit = 30 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Slack is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        };

        if (action === "list_messages") {
          if (!channelId) {
            return { error: "channelId is required for list_messages" };
          }
          const res = await fetch(
            `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
            { headers },
          );
          const data = await res.json();
          if (!data.ok) {
            return { error: data.error || "Failed to list messages" };
          }
          return {
            messages: ((data.messages as any[]) || []).map((m) => ({
              ts: m.ts,
              user: m.user,
              text: m.text,
              thread_ts: m.thread_ts,
            })),
          };
        }

        if (action === "send_message") {
          if (!channelId || !input.text || !input.approvalToken) {
            return { error: "Slack posting requires a reviewed channel, message, and approval token." };
          }
          const approval = slackMessageApprovalSchema.safeParse({ channelId, text: input.text });
          if (!approval.success) return { error: "Invalid approved Slack message." };
          const consumed = await slackApprovalRepository.consume(userId, input.approvalToken, approval.data);
          if (!consumed) return { error: "This Slack message was not approved, has expired, or was already sent." };
          const response = await fetch(`${SLACK_API}/chat.postMessage`, {
            method: "POST",
            headers,
            body: JSON.stringify({ channel: channelId, text: approval.data.text }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) return { error: data.error || `Slack API error: ${response.status}` };
          return { ok: true, channelId, message: data.message };
        }

        // list_channels
        const res = await fetch(
          `${SLACK_API}/conversations.list?limit=${limit}&exclude_archived=true&types=public_channel,private_channel`,
          { headers },
        );
        const data = await res.json();
        if (!data.ok) {
          return { error: data.error || "Failed to list channels" };
        }
        return {
          channels: ((data.channels as any[]) || []).map((c) => ({
            id: c.id,
            name: c.name,
            is_private: c.is_private,
            is_member: c.is_member,
          })),
        };
      } catch (error) {
        console.error("Slack tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Slack operation failed.",
        };
      }
    },
  });
}

export const slackTool = createTool({
  description: "Slack tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Slack tool requires user context. This should not happen in normal operation.",
  }),
});
