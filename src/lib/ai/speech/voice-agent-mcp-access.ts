import type { ChatMention } from "app-types/chat";

/** Only MCP tools explicitly attached to the currently selected agent may be proposed. */
export function agentMentionsMcpTool(
  mentions: ChatMention[] | undefined,
  serverId: string,
  toolName: string,
): boolean {
  return Boolean(
    mentions?.some(
      (mention) =>
        (mention.type === "mcpServer" && mention.serverId === serverId) ||
        (mention.type === "mcpTool" &&
          mention.serverId === serverId &&
          mention.name === toolName),
    ),
  );
}
