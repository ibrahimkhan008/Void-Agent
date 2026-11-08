import { getSession } from "auth/server";
import { agentMentionsMcpTool } from "lib/ai/speech/voice-agent-mcp-access";
import {
  createMcpServerConfigFingerprint,
  mcpToolApprovalProposalSchema,
} from "lib/ai/tools/hitl/mcp-tool-approval";
import { mcpToolApprovalRepository } from "lib/db/pg/repositories/mcp-tool-approval-repository.pg";
import { agentRepository, mcpRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const rate = await checkApiRateLimit({
    kind: "mcp-tool-approval",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 20_000);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = mcpToolApprovalProposalSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid MCP tool approval" },
      { status: 400 },
    );
  try {
    if (parsed.data.agentId) {
      const agent = await agentRepository.selectAgentById(
        parsed.data.agentId,
        session.user.id,
      );
      if (
        !agent ||
        !(await agentRepository.checkAccess(agent.id, session.user.id)) ||
        !agentMentionsMcpTool(
          agent.instructions?.mentions,
          parsed.data.serverId,
          parsed.data.toolName,
        )
      ) {
        return new Response(
          "The delegated agent can no longer use this MCP tool",
          {
            status: 403,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }
    const server = await mcpRepository.selectById(parsed.data.serverId);
    if (!server || server.name !== parsed.data.serverName)
      return new Response("MCP server not found", { status: 404 });
    if (server.enabled === false)
      return Response.json(
        { error: "MCP server is disabled; review a current tool proposal." },
        { status: 409 },
      );
    if (
      session.user.role !== "admin" &&
      server.userId !== session.user.id &&
      server.visibility !== "public"
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const serverConfigFingerprint = createMcpServerConfigFingerprint(
      server.config,
    );
    if (parsed.data.serverConfigFingerprint !== serverConfigFingerprint) {
      return Response.json(
        {
          error:
            "MCP server configuration changed; review the tool call again.",
        },
        { status: 409 },
      );
    }
    const {
      serverConfigFingerprint: _proposalFingerprint,
      ...approvalPayload
    } = parsed.data;
    const approvalToken = await mcpToolApprovalRepository.issue(
      session.user.id,
      approvalPayload,
      serverConfigFingerprint,
    );
    return Response.json(
      { approvalToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not record MCP tool approval" },
      { status: 503 },
    );
  }
}
