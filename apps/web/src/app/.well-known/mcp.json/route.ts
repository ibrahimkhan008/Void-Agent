import { NextResponse } from "next/server";

/**
 * MCP discovery file (/.well-known/mcp.json) — declares this deployment's
 * public, read-only MCP server so agents can find it. The URL is built from
 * the request origin so it is correct on any host.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      mcpServers: {
        "void-agent": { url: `${origin}/api/mcp/server` },
      },
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
