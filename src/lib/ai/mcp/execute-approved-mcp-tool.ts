import "server-only";
import { mcpToolApprovalRepository } from "lib/db/pg/repositories/mcp-tool-approval-repository.pg";
import { mcpToolApprovalSchema } from "lib/ai/tools/hitl/mcp-tool-approval";
import { boundMcpToolResult } from "./bounded-mcp-result";

export async function executeApprovedMcpTool<T>(input: {
  userId: string | undefined;
  token: unknown;
  approvalPayload: unknown;
  execute: () => Promise<T>;
}): Promise<T | { isError: true; error: { name: string; message: string } }> {
  const parsed = mcpToolApprovalSchema.safeParse(input.approvalPayload);
  if (!input.userId || typeof input.token !== "string" || !parsed.success) {
    return { isError: true, error: { name: "ApprovalRequired", message: "This MCP call requires explicit approval for the exact server, tool and arguments." } };
  }
  try {
    const consumed = await mcpToolApprovalRepository.consume(input.userId, input.token, parsed.data);
    if (!consumed) return { isError: true, error: { name: "ApprovalRequired", message: "MCP call approval is missing, expired, changed, or already used." } };
    const result = await input.execute();
    return boundMcpToolResult(result);
  } catch {
    return { isError: true, error: { name: "ApprovalUnavailable", message: "MCP call approval could not be verified; no tool was run." } };
  }
}
