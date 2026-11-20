import { IconArrowRight } from "@tabler/icons-react";
import { PageShell } from "@/components/landing/page-shell";
import { Button } from "@/components/landing/ui";
import { CodeBlock } from "@/components/public/code-block";
import { DocsHero, DocsSidebar } from "@/components/public/docs-chrome";
import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { APP_URL } from "lib/site";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs: Connect your tools with MCP | Void Agent",
  description:
    "Connect GitHub, Notion, Slack or any MCP server to Void Agent, use the tools in chat and Cloud Agent, and add the Void Agent MCP server to other agents.",
  alternates: { canonical: "/docs/mcp" },
};

const MCP_FLOW = [
  {
    n: "01",
    title: "You",
    body: "Ask for something in chat or give Cloud Agent a task.",
  },
  {
    n: "02",
    title: "Void Agent",
    body: "Sees which tools your servers offer and picks one.",
  },
  {
    n: "03",
    title: "MCP server",
    body: "Runs the tool with your access, for example creates an issue.",
  },
  {
    n: "04",
    title: "Result",
    body: "Comes back to the agent, which uses it in the next step.",
  },
];

const CONNECT_CARDS = [
  {
    title: "Open MCP",
    body: "Sign in and open MCP from the sidebar, then choose Add server.",
  },
  {
    title: "Name it",
    body: "Use letters, numbers and hyphens, like github or team-notion.",
  },
  {
    title: "Paste the config",
    body: "Paste the server's URL and any headers it needs, as JSON.",
  },
  {
    title: "Save",
    body: "Void Agent connects, lists the server's tools and keeps it in sync.",
  },
];

const CHAT_CARDS = [
  {
    title: "Let the agent choose",
    body: 'Ask in plain words: "file a bug for the login crash". It finds the right tool.',
  },
  {
    title: "Mention a tool",
    body: "Type @ in the composer and pick a server or tool to use it directly.",
  },
  {
    title: "Limit what it can use",
    body: "Turn servers or single tools on and off for a chat from the tools menu.",
  },
  {
    title: "Watch every call",
    body: "Each tool call shows its input and result right in the thread.",
  },
];

const SERVER_TOOLS = [
  [
    "voidagent_get_overview",
    "What Void Agent is, what it can do and where to start.",
  ],
  ["voidagent_list_models", "The models available in Void Agent, by provider."],
  [
    "voidagent_list_capabilities",
    "Product capabilities, such as Cloud Agent and schedules.",
  ],
  [
    "voidagent_list_pages",
    "Public Void Agent pages that can be read as Markdown.",
  ],
  [
    "voidagent_get_page",
    "The Markdown source of one public page, such as /docs or /pricing.",
  ],
];

const SAFETY_POINTS = [
  "Agents only see the servers and tools you turned on.",
  "Tokens and headers stay on our servers and are never shown to the model.",
  "Every tool call is visible in the thread, with its input and result.",
  "Remove a server any time and its tools disappear right away.",
  "MCP servers are run by other companies or by you. Only connect servers you trust.",
];

function SectionHeader({
  id,
  eyebrow,
  children,
}: { id: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-3xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-4xl">
        {children}
      </h2>
    </div>
  );
}

export default function McpDocsPage() {
  return (
    <PageShell>
      <DocsHero
        eyebrow="Docs · MCP"
        title="Connect Your Tools With"
        accent="MCP"
        sub="Plug GitHub, Notion, Slack, your own services or any MCP server into Void Agent, and let chat and Cloud Agent use them for you."
        active="mcp"
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-6 pb-32 lg:grid-cols-[220px_1fr] lg:gap-16">
        <DocsSidebar activeGroup="mcp" activeHref="/docs/mcp#what-is-mcp" />

        <article className="min-w-0 space-y-24">
          {/* What is MCP */}
          <SectionHeader id="what-is-mcp" eyebrow="Basics">
            What is <AccentSpan>MCP</AccentSpan>
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            The Model Context Protocol (MCP) is an open standard that lets AI
            apps use tools from other services. A service runs an MCP server
            that lists its tools, like{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              create_issue
            </code>{" "}
            or{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              search_pages
            </code>
            . Void Agent connects to that server, shows the tools to the agent,
            and runs them when the agent asks.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MCP_FLOW.map((step) => (
              <li
                key={step.n}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="h-full rounded-[14px] bg-[#0a0a0a] p-4">
                  <p className="font-mono text-[11px] text-(--brand)">
                    {step.n}
                  </p>
                  <p className="mt-2 text-sm font-medium text-(--paper)">
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs/5 text-(--paper)/60">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Connect a server */}
          <SectionHeader id="connect" eyebrow="Setup">
            Connect A Server In A Minute
          </SectionHeader>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CONNECT_CARDS.map((card, i) => (
              <div
                key={card.title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-[#0a0a0a] p-5">
                  <span className="grid size-8 place-items-center rounded-lg bg-(--paper) text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-base font-medium text-(--paper)">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-sm/6 text-(--paper)/60">
                    {card.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-base/8 text-(--paper)/70">
            A remote server needs a{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              url
            </code>
            . Add{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              headers
            </code>{" "}
            when the server wants an API key or token:
          </p>
          <CodeBlock
            label="Remote server"
            code={`{
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "Authorization": "Bearer YOUR_TOKEN" }
}`}
          />
          <p className="text-base/8 text-(--paper)/70">
            You can also paste a config that is wrapped in its name, the way
            many MCP servers document it. Void Agent fills in the name for you:
          </p>
          <CodeBlock
            label="Named config"
            code={`{ "notion": { "url": "https://mcp.notion.com/mcp" } }`}
          />
          <div className="rounded-[20px] bg-(--ink-2) p-6">
            <p className="text-sm font-medium text-(--paper)">
              Remote servers only on the hosted app
            </p>
            <p className="mt-2 text-sm/6 text-(--paper)/60">
              The hosted app connects to MCP servers over HTTPS. Servers that
              run as a local command (
              <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
                command
              </code>{" "}
              and{" "}
              <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
                args
              </code>
              ) only work on self-hosted Void Agent.
            </p>
          </div>

          {/* OAuth */}
          <SectionHeader id="oauth" eyebrow="Sign-in">
            Servers that need you to sign in
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Some servers, like Notion, ask you to sign in instead of pasting a
            token. When you add one, Void Agent opens the provider&apos;s
            sign-in page. Approve access there and you are sent back to Void
            Agent, connected. The token is stored on our servers and is never
            shown to the model.
          </p>

          {/* Use in chat */}
          <SectionHeader id="use" eyebrow="Chat">
            Use MCP tools in chat
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Once a server is connected, its tools are available in your chats.
            The agent decides when a tool helps, or you can point at one
            yourself.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CHAT_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-[#0a0a0a] p-5">
                  <h3 className="text-base font-medium text-(--paper)">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-sm/6 text-(--paper)/60">
                    {card.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Use in Cloud Agent */}
          <SectionHeader id="cloud-agent-mcp" eyebrow="Cloud Agent">
            Use MCP tools in Cloud Agent
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Cloud Agent loads your MCP tools next to its built-in{" "}
            <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              voidagent-mcp
            </code>{" "}
            tools, so one task can read your GitHub issues, change code in the
            sandbox, and post a summary to Slack. The same on and off choices
            apply, and you can run a task with MCP tools turned off completely.
          </p>
          <CodeBlock
            label="Example task"
            code={`Read the open issues labeled "bug" in our GitHub repo.
Fix the top one in the sandbox and run the tests.
Then post a short summary to #eng in Slack.`}
          />

          {/* Customize */}
          <SectionHeader id="customize" eyebrow="Customize">
            Teach a server how you work
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Add your own instructions to a whole server or to a single tool, for
            example &quot;always use the staging repo&quot; or &quot;write issue
            titles in English&quot;. Void Agent sends them to the agent every
            time that server or tool is used.
          </p>

          {/* Void Agent MCP server */}
          <SectionHeader id="voidagent-server" eyebrow="For other agents">
            The Void Agent MCP <AccentSpan>Server</AccentSpan>
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Void Agent also runs its own public MCP server, so other AI agents
            can learn about Void Agent: its models, capabilities and pages. It
            is read-only, needs no sign-in, and never touches anyone&apos;s
            workspace.
          </p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Endpoint", `${APP_URL}/api/mcp/server`],
              ["Transport", "Streamable HTTP (JSON)"],
              ["Discovery", `${APP_URL}/.well-known/mcp.json`],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-[14px] bg-[#0a0a0a] p-4 shadow-[var(--bs-shadow-card)]"
              >
                <dt className="font-mono text-[10px] tracking-[0.12em] text-(--paper)/45 uppercase">
                  {k}
                </dt>
                <dd className="mt-1.5 font-mono text-[13px] text-(--paper)">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <CodeBlock
            label="Add Void Agent to an MCP client"
            code={`{
  "mcpServers": {
    "Void Agent": { "url": "https://your-domain.example/api/mcp/server" }
  }
}`}
          />
          <CodeBlock
            label="List its tools"
            code={`curl -s https://your-domain.example/api/mcp/server \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
          />
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="divide-y divide-white/[0.06] rounded-[14px] bg-[#0a0a0a] px-5">
              {SERVER_TOOLS.map(([name, body]) => (
                <div
                  key={name}
                  className="grid gap-1 py-4 sm:grid-cols-[210px_1fr] sm:gap-4"
                >
                  <code className="font-mono text-[13px] text-(--brand)">
                    {name}
                  </code>
                  <p className="text-sm/6 text-(--paper)/70">{body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Safety */}
          <SectionHeader id="safety" eyebrow="Safety">
            Stay in <AccentSpan>control</AccentSpan>
          </SectionHeader>
          <ul className="mt-5 space-y-2 text-sm/6 text-(--paper)/60">
            {SAFETY_POINTS.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={`${APP_URL}/sign-up`} scheme="dark" size="lg" rounded>
              Connect your first server
              <IconArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button
              href="/docs"
              variant="secondary"
              scheme="dark"
              size="lg"
              rounded
            >
              Back to Agents
            </Button>
          </div>

          {/* Previous pager */}
          <Link
            href="/docs"
            className="group block rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)] transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center justify-between rounded-[14px] bg-[#0a0a0a] p-6">
              <div>
                <p className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  Previous
                </p>
                <p className="mt-2 text-lg font-medium text-(--paper) transition-colors group-hover:text-(--brand)">
                  How Void Agent agents get work done
                </p>
              </div>
              <ArrowLeft className="size-5 text-(--paper)/50 transition-transform duration-200 group-hover:-translate-x-1 group-hover:text-(--brand)" />
            </div>
          </Link>
        </article>
      </div>
    </PageShell>
  );
}
