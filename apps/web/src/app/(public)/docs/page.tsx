import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

export const metadata: Metadata = {
  title: "Docs: Agents and MCP | Void-Agent",
  description:
    "How Void-Agent agents work: autonomous chat, Cloud Agent, built-in tools, models, schedules and limits, plus how to connect your tools with MCP.",
  alternates: { canonical: "/docs" },
};

const SIDEBAR = [
  {
    group: "Agents",
    items: [
      { label: "Overview", href: "/docs#overview" },
      { label: "How an agent works", href: "/docs#loop" },
      { label: "Autonomous chat", href: "/docs#chat" },
      { label: "Cloud Agent", href: "/docs#cloud-agent" },
      { label: "Built-in tools", href: "/docs#tools" },
      { label: "Models", href: "/docs#models" },
      { label: "Schedules", href: "/docs#schedules" },
      { label: "Limits", href: "/docs#limits" },
    ],
  },
  {
    group: "MCP",
    items: [
      { label: "What is MCP", href: "/docs/mcp#what-is-mcp" },
      { label: "Connect a server", href: "/docs/mcp#connect" },
      { label: "Servers with sign-in", href: "/docs/mcp#oauth" },
      { label: "Use tools in chat", href: "/docs/mcp#use" },
      { label: "Use tools in Cloud Agent", href: "/docs/mcp#cloud-agent-mcp" },
      { label: "Customize tools", href: "/docs/mcp#customize" },
      { label: "Void-Agent MCP server", href: "/docs/mcp#voidagent-server" },
      { label: "Safety", href: "/docs/mcp#safety" },
    ],
  },
];

const AGENT_CARDS = [
  {
    name: "Autonomous chat",
    rows: [
      ["Best for", "Research, writing, analysis, quick tasks"],
      ["Works in", "Inside any chat thread"],
      ["Runs", "While the reply streams"],
    ],
  },
  {
    name: "Cloud Agent",
    rows: [
      ["Best for", "Apps, data work, long multi-step jobs"],
      ["Works in", "Its own Linux sandbox"],
      ["Runs", "In the background, minutes or hours"],
    ],
  },
];

const LOOP_STEPS = [
  {
    n: "01",
    title: "Plan",
    body: "Reads your request and writes a short plan.",
  },
  {
    n: "02",
    title: "Act",
    body: "Calls a tool: search, code, a browser, your MCP servers.",
  },
  {
    n: "03",
    title: "Observe",
    body: "Reads the result and checks it against the plan.",
  },
  {
    n: "04",
    title: "Repeat",
    body: "Fixes errors and keeps going until the plan is done.",
  },
  {
    n: "05",
    title: "Deliver",
    body: "Hands you the answer, files or a live link.",
  },
];

const CHAT_CARDS = [
  {
    title: "Write the goal, not the steps",
    body: '"Compare the top CRM tools for a 10-person team" works better than a list of searches.',
  },
  {
    title: "Attach what it should read",
    body: "PDFs, sheets, docs and images. It reads them before it answers.",
  },
  {
    title: "Point at tools with @",
    body: "Type @ to pick a tool or MCP server so the chat uses exactly that.",
  },
  {
    title: "Switch models any time",
    body: "The thread keeps its history when you change models mid-conversation.",
  },
];

const CLOUD_CARDS = [
  {
    title: "Describe the task",
    body: 'Say what done looks like: "a dashboard for our Stripe data with MRR and churn charts".',
  },
  {
    title: "It starts a sandbox",
    body: "A fresh Linux machine spins up just for this task.",
  },
  {
    title: "It works in the background",
    body: "Close the tab. The run keeps going on our servers and saves its progress.",
  },
  {
    title: "Come back to results",
    body: "Files, a preview link, documents or a summary, waiting in the thread.",
  },
];

const TOOLS = [
  [
    "voidagent_execute",
    "Runs shell commands in the sandbox: installs, builds, tests, servers.",
  ],
  [
    "voidagent_files",
    "Reads, writes, edits, lists and deletes files in the workspace.",
  ],
  ["voidagent_search", "Searches the web for current information."],
  [
    "voidagent_browser",
    "Opens pages, clicks, types, reads text and takes screenshots.",
  ],
  [
    "voidagent_computer",
    "Controls a full desktop when a site needs a real mouse and keyboard.",
  ],
  ["voidagent_image", "Generates and edits images."],
  [
    "voidagent_document",
    "Creates documents and slide decks, including PowerPoint files.",
  ],
  [
    "voidagent_preview",
    "Opens a live preview link for an app running in the sandbox.",
  ],
  ["voidagent_publish", "Shares a finished file with you as a download."],
  ["voidagent_memory", "Saves notes and finds them again in later runs."],
  [
    "voidagent_swarm",
    "Splits big jobs across parallel sub-agents and merges the results.",
  ],
  [
    "voidagent_task",
    "Keeps a task list for the run so progress is easy to follow.",
  ],
];

const LIMITS: [string, string, string, string, string][] = [
  ["Cloud Agent launches / week", "1", "5", "15", "50"],
  ["Sandbox CPU hours / week", "1", "2", "4", "13"],
  ["Agent tokens / week", "25K", "250K", "750K", "2.5M"],
  ["Swarm launches / day", "2", "15", "50", "200"],
  ["Scheduled runs / week", "8", "75", "250", "1,250"],
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

export default function DocsPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* 1. Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-40 pb-16 text-center sm:pt-48">
        <Eyebrow>Docs · Agents</Eyebrow>
        <h1 className="mt-6 text-5xl leading-[1.03] font-normal tracking-[-0.04em] text-balance text-(--paper) sm:text-6xl lg:text-7xl">
          How Void-Agent Agents <AccentSpan>Get Work Done</AccentSpan>
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-lg/8 text-pretty text-(--paper)/60">
          Everything you need to know about autonomous chat and Cloud Agent: how
          they think, which tools they use, and how to hand them real work.
        </p>
        <div className="mt-8 inline-flex rounded-full border border-black/[0.08] bg-(--ink-2) p-1">
          <span
            aria-current="location"
            className="inline-flex h-8 items-center rounded-full bg-white px-4 text-sm font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
          >
            Agents
          </span>
          <Link
            href="/docs/mcp"
            className="inline-flex h-8 items-center rounded-full px-4 text-sm text-(--paper)/60 transition-colors hover:text-(--paper)"
          >
            MCP
          </Link>
        </div>
      </section>

      {/* 2. Layout: sticky sidebar + article */}
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pb-32 lg:grid-cols-[220px_1fr] lg:gap-16">
        <nav
          aria-label="Docs"
          className="hidden self-start space-y-8 text-sm lg:sticky lg:top-28 lg:block"
        >
          {SIDEBAR.map((group) => (
            <div key={group.group}>
              <p className="mb-3 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
                {group.group}
              </p>
              <ul className="space-y-0.5 border-l border-black/10">
                {group.items.map((item) => (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      className="-ml-px block border-l border-transparent py-1.5 pl-4 text-(--paper)/55 transition-colors hover:border-(--brand-glow) hover:text-(--paper)"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <article className="min-w-0 space-y-24">
          {/* Overview */}
          <SectionHeader id="overview" eyebrow="Overview">
            Two ways to hand off work
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Void-Agent has two kinds of agents.{" "}
            <strong className="font-medium text-(--paper)">
              Autonomous chat
            </strong>{" "}
            lives in your conversation: it searches, reads files, calls tools
            and answers with sources.{" "}
            <strong className="font-medium text-(--paper)">Cloud Agent</strong>{" "}
            gets its own Linux computer: it writes and runs code, uses a
            browser, builds apps and keeps working after you close the tab.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {AGENT_CARDS.map((card) => (
              <div
                key={card.name}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white p-5">
                  <h3 className="text-base font-medium text-(--paper)">
                    {card.name}
                  </h3>
                  <dl className="mt-3">
                    {card.rows.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-4 border-t border-black/[0.06] py-2"
                      >
                        <dt className="text-sm text-(--paper)/45">{k}</dt>
                        <dd className="text-right text-sm text-(--paper)/80">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ))}
          </div>

          {/* The loop */}
          <SectionHeader id="loop" eyebrow="The loop">
            How An Agent <AccentSpan>Works</AccentSpan>
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Both agents run the same loop. They do not guess the whole answer in
            one go. They take a step, look at what happened, and decide the next
            step, until the job is done or they need you.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-5">
            {LOOP_STEPS.map((step) => (
              <li
                key={step.n}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="h-full rounded-[14px] bg-white p-4">
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
          <p className="mt-5 text-base/8 text-(--paper)/70">
            You can watch every step as it happens: each tool call shows what it
            was asked to do and what came back. Press{" "}
            <strong className="font-medium text-(--paper)">Stop</strong> at any
            time, or send a new message to steer it.
          </p>

          {/* Autonomous chat */}
          <SectionHeader id="chat" eyebrow="Autonomous chat">
            Ask once, get a finished answer
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Type what you want in plain words. The chat picks the tools it
            needs: web search for anything current, code for math and data,
            files you attached, image generation, and any MCP servers you turned
            on.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CHAT_CARDS.map((card, i) => (
              <div
                key={card.title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white p-5">
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

          {/* Cloud Agent */}
          <SectionHeader id="cloud-agent" eyebrow="Cloud Agent">
            A Teammate With Its Own <AccentSpan>Computer</AccentSpan>
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Every Cloud Agent task gets a private Linux sandbox with Node.js,
            Python, git and a browser. The agent plans the work, writes the
            code, runs it, fixes what breaks, and gives you a live preview link
            for apps it builds.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CLOUD_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white p-5">
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
          <div className="rounded-[20px] bg-(--ink-2) p-6">
            <p className="text-sm font-medium text-(--paper)">Good to know</p>
            <ul className="mt-3 space-y-2 text-sm/6 text-(--paper)/60">
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                Stop works instantly, even in the middle of a tool call.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                If a run is interrupted, press Continue and it picks up from the
                same step.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                The sandbox pauses when idle and its files are saved, so you can
                come back to the same workspace later.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                Very long single commands are better run in the background; ask
                the agent to do that for builds and servers.
              </li>
            </ul>
          </div>

          {/* Built-in tools */}
          <SectionHeader id="tools" eyebrow="Built-in tools">
            What Cloud Agent can do out of the box
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Cloud Agent comes with a built-in tool server called{" "}
            <code className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[0.88em] text-(--paper)">
              voidagent-mcp
            </code>
            . You do not need to set anything up. Your own MCP servers are added
            on top of these.
          </p>
          <div className="mt-8 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="divide-y divide-black/[0.06] rounded-[14px] bg-white px-5">
              {TOOLS.map(([name, body]) => (
                <div
                  key={name}
                  className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"
                >
                  <code className="font-mono text-[13px] text-(--brand)">
                    {name}
                  </code>
                  <p className="text-sm/6 text-(--paper)/70">{body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Models */}
          <SectionHeader id="models" eyebrow="Models">
            Pick the right brain for each step
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Agents run on any of the 30+ models in Void-Agent, from Anthropic,
            OpenAI, Google, DeepSeek, Moonshot, Qwen, xAI and more. Use a fast
            model for drafts and a reasoning model for the hard parts.
          </p>
          <p className="text-base/8 text-(--paper)/70">
            When you switch models, Void-Agent adapts the conversation and
            earlier tool calls so the next model can read them. If a model fails
            in the middle of a reply, Void-Agent retries on a backup model so
            the task keeps moving.
          </p>

          {/* Schedules */}
          <SectionHeader id="schedules" eyebrow="Schedules">
            Agents that run on their own
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            A schedule is a saved prompt with a timetable, like "every weekday
            at 8:00, summarize overnight news for my watchlist". Each run uses
            the model and tools you chose, and the result lands in your Library.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              ["Open Schedules", "Create a schedule from the sidebar."],
              [
                "Write the prompt",
                "Same as a chat message, written as an instruction.",
              ],
              [
                "Pick when it runs",
                "Hourly, daily, weekdays or a custom time.",
              ],
              [
                "Read the results",
                "Every run is saved to your Library, ready to search.",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white p-5">
                  <h3 className="text-base font-medium text-(--paper)">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm/6 text-(--paper)/60">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Limits */}
          <SectionHeader id="limits" eyebrow="Limits">
            What each plan includes
          </SectionHeader>
          <p className="mt-5 text-base/8 text-(--paper)/70">
            Agent usage is counted per plan and resets weekly on Monday (UTC)
            (Swarm resets daily). Upgrade any time from the{" "}
            <Link
              href="/pricing"
              className="font-medium text-(--brand) underline decoration-(--brand)/30 underline-offset-4 hover:decoration-(--brand)"
            >
              pricing page
            </Link>{" "}
            if you need more.
          </p>
          <div className="mt-8 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="overflow-x-auto rounded-[14px] bg-white p-2">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-(--ink-2)/60">
                    {["Limit", "Free", "Plus", "Pro", "Scale"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[11px] font-medium tracking-[0.12em] text-(--paper)/55 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LIMITS.map((row) => (
                    <tr key={row[0]} className="border-t border-black/[0.06]">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`px-4 py-3 ${j === 0 ? "text-(--paper)/75" : "tabular-nums text-(--paper)/85"}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Next pager */}
          <Link
            href="/docs/mcp"
            className="group block rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)] transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center justify-between rounded-[14px] bg-white p-6">
              <div>
                <p className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  Next
                </p>
                <p className="mt-2 text-lg font-medium text-(--paper) transition-colors group-hover:text-(--brand)">
                  Connect your tools with MCP
                </p>
              </div>
              <ArrowRight className="size-5 text-(--paper)/50 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-(--brand)" />
            </div>
          </Link>
        </article>
      </div>

      <PublicFooter />
    </div>
  );
}
