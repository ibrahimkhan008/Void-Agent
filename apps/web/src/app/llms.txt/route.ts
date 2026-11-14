import { NextResponse } from "next/server";

/**
 * llms.txt — the standard index of pages that can be read as Markdown by AI
 * tools. Served with a markdown content type.
 */
export function GET() {
  const body = `# Void-Agent

> Void-Agent is a universal autonomous AI workspace: multi-model chat, autonomous Cloud Agents in isolated Linux sandboxes, visual workflows, schedules, MCP connectors, canvas creation and voice — one product, any model, no vendor lock-in.

Public pages (readable as Markdown):

- [Home](https://void-agent.dev/): Autonomous AI agents, on any model.
- [About](https://void-agent.dev/about): What we build and why.
- [Pricing](https://void-agent.dev/pricing): Plans and transparent weekly quotas.
- [Docs: Agents](https://void-agent.dev/docs): How the agents think, which tools they use, and how to hand them real work.
- [Docs: MCP](https://void-agent.dev/docs/mcp): Connect GitHub, Notion, Slack or any MCP server.
- [Index](https://void-agent.dev/updates): Releases, research and engineering dispatches.
- [Contact](https://void-agent.dev/contact): Support, sales, security and privacy channels.
- [Contact sales](https://void-agent.dev/contact-sales): Capacity and deployment planning.
- [Void-Agent vs Manus](https://void-agent.dev/vs/manus): Autonomous agent platform comparison.
- [Privacy policy](https://void-agent.dev/privacy-policy)
- [Terms of service](https://void-agent.dev/terms-of-service)
- [Cookies policy](https://void-agent.dev/cookies-policy)
- [Refund policy](https://void-agent.dev/refund-policy)
- [Grievance and data rights](https://void-agent.dev/grievance-redressal)
- [Design](https://void-agent.dev/design.md): The Void-Agent design system, as Markdown.
- [MCP discovery](https://void-agent.dev/.well-known/mcp.json): This deployment's public, read-only MCP server.

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
