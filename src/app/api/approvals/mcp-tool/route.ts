import { getSession } from "auth/server";
import { mcpToolApprovalSchema } from "lib/ai/tools/hitl/mcp-tool-approval";
import { mcpToolApprovalRepository } from "lib/db/pg/repositories/mcp-tool-approval-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { mcpRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  } catch { return new Response("Forbidden", { status: 403 }); }
  const rate = await checkApiRateLimit({ kind: "mcp-tool-approval", id: session.user.id, limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 20_000);
  if (!body.ok) return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", { status: body.tooLarge ? 413 : 400 });
  const parsed = mcpToolApprovalSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Invalid MCP tool approval" }, { status: 400 });
  try {
    const server = await mcpRepository.selectById(parsed.data.serverId);
    if (!server || server.name !== parsed.data.serverName) return new Response("MCP server not found", { status: 404 });
    if (session.user.role !== "admin" && server.userId !== session.user.id && server.visibility !== "public") {
      return new Response("Forbidden", { status: 403 });
    }
    const approvalToken = await mcpToolApprovalRepository.issue(session.user.id, parsed.data);
    return Response.json({ approvalToken }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not record MCP tool approval" }, { status: 503 });
  }
}
