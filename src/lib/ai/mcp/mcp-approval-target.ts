import "server-only";

import {
  type McpToolApprovalRequest,
  createMcpServerConfigFingerprint,
} from "lib/ai/tools/hitl/mcp-tool-approval";
import { mcpRepository } from "lib/db/repository";

/** Re-read and authorize the target whenever a one-use MCP approval is checked. */
export async function getMcpApprovalTargetFingerprint(input: {
  userId: string;
  userRole?: string | null;
  approval: Pick<McpToolApprovalRequest, "serverId" | "serverName">;
}): Promise<string | undefined> {
  const server = await mcpRepository.selectById(input.approval.serverId);
  if (
    !server ||
    server.name !== input.approval.serverName ||
    server.enabled === false
  )
    return;
  const canAccess =
    input.userRole === "admin" ||
    server.userId === input.userId ||
    server.visibility === "public";
  if (!canAccess) return;
  return createMcpServerConfigFingerprint(server.config);
}
