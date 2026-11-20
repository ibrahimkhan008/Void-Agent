"use client";

import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { APP_URL } from "lib/site";
import { cn } from "lib/utils";
import Link from "next/link";
import { useRef, useState } from "react";

interface AgentTab {
  id: string;
  label: string;
  desc: string;
  newPill?: boolean;
}

const TABS: AgentTab[] = [
  {
    id: "cloud-agent",
    label: "Cloud Agent",
    desc: "Hand off the whole job. Check back later.",
  },
  {
    id: "autonomous-chat",
    label: "Autonomous chat",
    desc: "Ask once. It searches, reads and answers with sources.",
  },
  {
    id: "mcp-tools",
    label: "MCP tools",
    desc: "Connect GitHub, Notion, Slack or any MCP server.",
  },
  {
    id: "sandboxes",
    label: "Sandboxes",
    desc: "A real Linux machine with a terminal and a live URL.",
  },
  {
    id: "schedules",
    label: "Schedules",
    desc: "Prompts that run on their own, on your timetable.",
    newPill: true,
  },
] as const;

const TASK_LINES = [
  {
    n: 1,
    text: [
      { t: "Build a Next.js dashboard " },
      { t: "for", red: true },
      { t: " our Stripe data." },
    ],
  },
  { n: 2, text: [{ t: "" }] },
  { n: 3, text: [{ t: "- Pull live numbers with the Stripe MCP server" }] },
  { n: 4, text: [{ t: "- Add charts for MRR and churn" }] },
  {
    n: 5,
    text: [{ t: "- Run it in the sandbox and send me the preview link" }],
  },
  { n: 6, text: [{ t: "- Save a short summary to my Library" }] },
];

const RUNS = [
  {
    name: "stripe-dashboard",
    model: "Claude Sonnet 5.5",
    step: "Done 5/5",
    status: "Done",
    pct: 100,
    color: "#5cb87f",
  },
  {
    name: "landing-page",
    model: "GPT 6.1 Sol",
    step: "Install 3/5",
    status: "Running",
    pct: 52,
    color: "#13806f",
  },
  {
    name: "csv-cleanup",
    model: "DeepSeek V4 Pro",
    step: "Code 2/5",
    status: "Retrying",
    pct: 30,
    color: "#e2a63f",
  },
];

export function AgentsTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (active + 1) % TABS.length
        : (active - 1 + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="agents" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <Eyebrow>Cloud Agent</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Hand It The Work. <AccentSpan>Check Back Later.</AccentSpan>
          </h2>
          <p className="mt-5 max-w-[60ch] text-lg/8 text-(--paper)/60">
            Cloud Agent and autonomous chats plan the task, use your tools, run
            code in their own sandbox, and keep going after you close the tab.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`${APP_URL}/sign-up`}
              className="bs-btn bs-btn-outline h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
            >
              Start a task
            </Link>
            <Link
              href="/docs"
              className="bs-btn bs-btn-default h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
            >
              Read the docs
            </Link>
          </div>
        </div>

        {/* Tabstrip */}
        <div
          role="tablist"
          aria-label="Agent features"
          className="mt-14 grid snap-x grid-flow-col auto-cols-max gap-0 overflow-x-auto md:grid-cols-5 md:auto-cols-auto"
        >
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`agents-tab-${i}`}
              aria-selected={active === i}
              aria-controls="agents-panel"
              tabIndex={active === i ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => setActive(i)}
              className={cn(
                "w-56 snap-start border-t-2 py-5 text-left transition-colors",
                active === i
                  ? "border-(--brand)"
                  : "border-black/10 hover:border-black/25",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-2 text-sm font-medium",
                  active === i ? "text-(--paper)" : "text-(--paper)/55",
                )}
              >
                {tab.label}
                {tab.newPill && (
                  <span className="rounded-md bg-(--brand)/10 px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] text-(--brand) uppercase">
                    New
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs/5 text-(--paper)/55">
                {tab.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Panel */}
        <div
          id="agents-panel"
          role="tabpanel"
          aria-labelledby={`agents-tab-${active}`}
          className="border-y border-black/10 bg-(--ink-2) py-10 sm:py-14"
        >
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:h-[460px]">
            {/* Editor mock */}
            <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-[#1e1f22]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-white/90">md / task.md</span>
                  <span className="text-white/35">.env</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60">
                    Copy code
                  </span>
                  <span className="rounded-md bg-(--brand) px-2 py-1 text-[11px] font-medium text-white">
                    Run
                  </span>
                </div>
              </div>
              <div className="p-4 font-mono text-[13px]/7">
                {TASK_LINES.map((line, i) => (
                  <div
                    key={line.n}
                    className={cn(
                      "flex gap-4 rounded px-2",
                      i === 0 && "bg-(--brand)/[0.06]",
                    )}
                  >
                    <span className="w-4 text-right text-white/30">
                      {line.n}
                    </span>
                    <span className="text-white/85">
                      {line.text.map((part, j) => (
                        <span
                          key={j}
                          style={part.red ? { color: "#cf222e" } : undefined}
                        >
                          {part.t}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2 font-mono text-[10px] text-white/35">
                <span>Markdown · UTF-8</span>
                <span>● Void Agent</span>
                <span className="ml-auto">Ln 1 , Col 47</span>
              </div>
            </div>

            {/* Runs card */}
            <div className="flex flex-col rounded-2xl border border-black/[0.08] bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-(--paper)">
                  Agent runs
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-(--brand)/10 px-2.5 py-1 text-[11px] font-medium text-(--brand)">
                  <span className="size-1.5 rounded-full bg-(--brand)" />
                  Sandbox live
                </span>
              </div>
              <ul className="mt-4 flex-1 space-y-2">
                {RUNS.map((run) => (
                  <li
                    key={run.name}
                    className="flex items-center gap-3 rounded-xl border border-black/[0.06] px-3 py-2.5"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: run.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-(--paper)">
                        {run.name}
                      </p>
                      <p className="text-[11px] text-(--paper)/50">
                        {run.model}
                      </p>
                    </div>
                    <span className="text-[11px] text-(--paper)/55">
                      {run.step}
                    </span>
                    <span className="hidden text-[11px] text-(--paper)/55 sm:inline">
                      {run.status}
                    </span>
                    <span className="w-10 text-right text-xs font-medium tabular-nums text-(--paper)">
                      {run.pct}%
                    </span>
                  </li>
                ))}
              </ul>
              <input
                type="text"
                placeholder="Filter by task or model"
                aria-label="Filter agent runs"
                className="mt-3 w-full rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-xs text-(--paper) outline-none focus-visible:ring-2 focus-visible:ring-(--paper)/30"
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-(--paper)/50">
                <span>Runs keep going after you close the tab</span>
                <span>Linux sandbox</span>
                <span className="inline-flex items-center gap-1 text-(--brand)">
                  Live
                  <span className="size-3 animate-spin rounded-full border border-(--brand) border-t-transparent" />
                </span>
              </div>
              <p className="mt-4 border-t border-black/[0.06] pt-3 font-mono text-[11px] text-(--paper)/55">
                Steps 38 · Running 2 · Files 41
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
