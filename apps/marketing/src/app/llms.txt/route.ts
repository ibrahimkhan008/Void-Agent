import { APP_URL, MARKETING_URL } from "lib/site";
import { NextResponse } from "next/server";

/**
 * llms.txt — the standard index of pages that can be read as Markdown by AI
 * tools. Served with a markdown content type. Links are built from the
 * cross-domain config (no hardcoded domains — the old build hardcoded the
 * stale void-agent.dev host).
 */
export function GET() {
  const body = `# Void-Agent

> Void-Agent is a universal autonomous AI workspace: multi-model chat, autonomous Cloud Agents in isolated Linux sandboxes, visual workflows, schedules, MCP connectors, canvas creation and voice — one product, any model, no vendor lock-in.

Public pages (readable as Markdown):

- [Home](${MARKETING_URL}/): Autonomous AI agents, on any model.
- [About](${MARKETING_URL}/about): What we build and why.
- [Pricing](${MARKETING_URL}/pricing): Plans and transparent weekly quotas.
- [Docs: Agents](${MARKETING_URL}/docs): How the agents think, which tools they use, and how to hand them real work.
- [Docs: MCP](${MARKETING_URL}/docs/mcp): Connect GitHub, Notion, Slack or any MCP server.
- [Index](${MARKETING_URL}/index): Releases, research and engineering dispatches.
- [Contact](${MARKETING_URL}/contact): Support, sales, security and privacy channels.
- [Contact sales](${MARKETING_URL}/contact-sales): Capacity and deployment planning.
- [Void-Agent vs Manus](${MARKETING_URL}/vs/manus): Autonomous agent platform comparison.
- [Privacy policy](${MARKETING_URL}/privacy-policy)
- [Terms of service](${MARKETING_URL}/terms-of-service)
- [Cookies policy](${MARKETING_URL}/cookies-policy)
- [Refund policy](${MARKETING_URL}/refund-policy)
- [Grievance and data rights](${MARKETING_URL}/grievance-redressal)
- [Design](${MARKETING_URL}/design.md): The Void-Agent design system, as Markdown.
- [MCP discovery](${APP_URL}/.well-known/mcp.json): This deployment's public, read-only MCP server.

Contact: support@voidagent.space
`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
