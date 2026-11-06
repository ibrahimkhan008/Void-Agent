import "server-only";
import { mcpRepository } from "lib/db/repository";

type WorkflowNode = {
  kind?: string;
  nodeConfig?: Record<string, unknown> | null;
};

/** Reject saved graphs that would dispatch through an MCP connection unavailable to the caller. */
export async function assertWorkflowMcpAccess(userId: string, nodes: WorkflowNode[]) {
  const references = nodes.flatMap((node) => {
    if (node.kind !== "tool") return [];
    const tool = node.nodeConfig?.tool as { type?: string; serverId?: string; serverName?: string } | undefined;
    if (tool?.type !== "mcp-tool") return [];
    return [{ serverId: tool.serverId, serverName: tool.serverName }];
  });
  if (!references.length) return;

  const accessible = await mcpRepository.selectAllForUser(userId);
  const byId = new Map(accessible.map((server) => [server.id, server]));
  for (const reference of references) {
    const server = reference.serverId ? byId.get(reference.serverId) : undefined;
    if (!server || server.enabled === false || server.name !== reference.serverName) {
      throw new Error("This workflow references an MCP connection that is unavailable to your account.");
    }
  }
}
