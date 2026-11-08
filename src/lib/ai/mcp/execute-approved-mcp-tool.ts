import "server-only";
import { mcpToolApprovalSchema } from "lib/ai/tools/hitl/mcp-tool-approval";
import { mcpToolApprovalRepository } from "lib/db/pg/repositories/mcp-tool-approval-repository.pg";
import { boundMcpToolResult } from "./bounded-mcp-result";
import { protectMorphikMcpResult } from "./morphik-media-reference";

export async function executeApprovedMcpTool<T>(input: {
  userId: string | undefined;
  token: unknown;
  approvalPayload: unknown;
  getCurrentConfigFingerprint: () => Promise<string | undefined>;
  execute: (expectedConfigFingerprint: string) => Promise<T>;
}): Promise<T | { isError: true; error: { name: string; message: string } }> {
  const parsed = mcpToolApprovalSchema.safeParse(input.approvalPayload);
  if (!input.userId || typeof input.token !== "string" || !parsed.success) {
    return {
      isError: true,
      error: {
        name: "ApprovalRequired",
        message:
          "This MCP call requires explicit approval for the exact server, tool and arguments.",
      },
    };
  }
  try {
    const currentFingerprint = await input.getCurrentConfigFingerprint();
    if (!currentFingerprint)
      return {
        isError: true,
        error: {
          name: "ApprovalRequired",
          message:
            "The approved MCP server is no longer available to this user.",
        },
      };
    const consumed = await mcpToolApprovalRepository.consume(
      input.userId,
      input.token,
      parsed.data,
      currentFingerprint,
    );
    if (!consumed)
      return {
        isError: true,
        error: {
          name: "ApprovalRequired",
          message:
            "MCP call approval is missing, expired, changed, or already used.",
        },
      };
    // Re-read after consuming the one-use token so a config change during the
    // approval check cannot redirect the call to a different MCP endpoint.
    const dispatchFingerprint = await input.getCurrentConfigFingerprint();
    if (dispatchFingerprint !== currentFingerprint)
      return {
        isError: true,
        error: {
          name: "ApprovalRequired",
          message:
            "The MCP server configuration changed after approval. Review the call again.",
        },
      };
    const result = await input.execute(currentFingerprint);
    const bounded = boundMcpToolResult(result);
    return protectMorphikMcpResult(bounded, input.userId) as typeof bounded;
  } catch {
    return {
      isError: true,
      error: {
        name: "ApprovalUnavailable",
        message: "MCP call approval could not be verified; no tool was run.",
      },
    };
  }
}
