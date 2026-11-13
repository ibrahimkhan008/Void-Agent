import { NextResponse } from "next/server";

/**
 * Public, read-only MCP server (streamable HTTP / JSON-RPC).
 *
 * Lets other AI agents learn about Void-Agent: its models, capabilities and
 * public pages. Read-only, no sign-in, and it never touches any workspace —
 * it only serves the static product catalog below.
 */

const PROTOCOL_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "void-agent",
  title: "Void-Agent",
  version: "1.0.0",
};

const CAPABILITIES = [
  "Multi-model chat — switch models inside the same thread",
  "Cloud Agent — autonomous tasks in an isolated Linux sandbox",
  "Built-in tools — web search, code, files, image generation",
  "Visual workflows — reusable LLM/HTTP/tool node graphs",
  "Schedules — prompts that run on their own timetable",
  "MCP connectors — bring your own tools",
  "Canvas — AI-native documents, decks and sheets",
  "Voice — realtime speech input and playback",
];

const MODELS = [
  { provider: "Anthropic", models: ["Claude Sonnet", "Claude Opus"] },
  { provider: "OpenAI", models: ["GPT-4o", "GPT family"] },
  { provider: "Google", models: ["Gemini Pro", "Gemini Flash"] },
  { provider: "DeepSeek", models: ["DeepSeek V3/R1"] },
  { provider: "Groq", models: ["Llama family", "Compound systems"] },
  { provider: "Z AI", models: ["GLM family"] },
];

const PAGES = [
  { path: "/", title: "Void-Agent — Autonomous AI agents, on any model" },
  { path: "/about", title: "About Void-Agent" },
  { path: "/pricing", title: "Simple Pricing For Every Builder" },
  { path: "/docs", title: "How Void-Agent agents get work done" },
  { path: "/docs/mcp", title: "Connect your tools with MCP" },
  { path: "/updates", title: "Index of releases, research & updates" },
  { path: "/contact", title: "Contact Void-Agent" },
];

function pageMarkdown(path: string): string {
  const page = PAGES.find((p) => p.path === path);
  if (!page) return `Not found: ${path}`;
  return `# ${page.title}\n\n${page.path} — part of Void-Agent (https://void-agent.dev).`;
}

const TOOLS = [
  {
    name: "voidagent_get_overview",
    description: "What Void-Agent is, what it can do and where to start.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "voidagent_list_models",
    description: "The models available in Void-Agent, by provider.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "voidagent_list_capabilities",
    description: "Product capabilities, such as Cloud Agent and schedules.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "voidagent_list_pages",
    description: "Public Void-Agent pages that can be read as Markdown.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "voidagent_get_page",
    description:
      "The Markdown source of one public page, such as /docs or /pricing.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Public page path, e.g. /docs" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

function textResult(text: string) {
  return { content: [{ type: "text", text }], isError: false };
}

function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "voidagent_get_overview":
      return textResult(
        [
          "# Void-Agent",
          "",
          "Void-Agent is a universal autonomous AI workspace: multi-model chat,",
          "autonomous Cloud Agents in isolated Linux sandboxes, visual workflows,",
          "schedules, MCP connectors, canvas creation and voice — one product,",
          "any model, no vendor lock-in.",
          "",
          "Start at https://void-agent.dev/ or read /docs.",
        ].join("\n"),
      );
    case "voidagent_list_models":
      return textResult(
        MODELS.map((m) => `${m.provider}: ${m.models.join(", ")}`).join("\n"),
      );
    case "voidagent_list_capabilities":
      return textResult(CAPABILITIES.map((c) => `- ${c}`).join("\n"));
    case "voidagent_list_pages":
      return textResult(PAGES.map((p) => `${p.path} — ${p.title}`).join("\n"));
    case "voidagent_get_page":
      return textResult(pageMarkdown(String(args?.path ?? "")));
    default:
      return textResult(`Unknown tool: ${name}`);
  }
}

function jsonRpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status: code === -32601 ? 400 : 200 },
  );
}

export async function POST(request: Request) {
  let body: {
    id?: unknown;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { id = null, method } = body;

  switch (method) {
    case "initialize":
      return jsonRpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
      return new NextResponse(null, { status: 202 });
    case "tools/list":
      return jsonRpc(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(body.params?.name ?? "");
      const args = (body.params?.arguments as Record<string, unknown>) ?? {};
      return jsonRpc(id, callTool(name, args));
    }
    case "ping":
      return jsonRpc(id, {});
    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

export function GET() {
  return NextResponse.json(
    {
      error: "use_post",
      hint: "Send JSON-RPC 2.0 requests via POST (streamable HTTP transport).",
      server: SERVER_INFO,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
