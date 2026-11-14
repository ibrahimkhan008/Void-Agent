"use client";

import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { APP_URL } from "lib/site";
import { cn } from "lib/utils";
import Link from "next/link";
import { useState } from "react";

interface Lab {
  id: string;
  label: string;
  color: string;
  mark: string;
  model: string;
  blurb: string;
  chips: string[];
  sample: {
    user: string;
    steps: string[];
    answer: string;
    table?: { header: string[]; rows: string[][] };
  };
}

const LABS: Lab[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    color: "#D97757",
    mark: "✳",
    model: "Claude Sonnet 5.5",
    blurb:
      "Careful writing, long tasks and code. The default brain for Cloud Agent.",
    chips: ["Agent", "Image input", "Tool use", "+ 4 more"],
    sample: {
      user: "Which of our open bugs block the release?",
      steps: ["Read 64 open GitHub issues", "Checked the release milestone"],
      answer: "These four need a fix before Friday:",
      table: {
        header: ["Issue", "Area", "Problem", "Opened", "Priority"],
        rows: [
          ["#482", "Auth", "Safari login crash", "3d", "High"],
          ["#477", "Billing", "Double charge on retry", "5d", "High"],
          ["#469", "Export", "CSV drops emoji", "1w", "Medium"],
          ["#455", "UI", "Sidebar flicker", "2w", "Low"],
        ],
      },
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    color: "#10a37f",
    mark: "◎",
    model: "GPT 6.1 Sol",
    blurb:
      "Strong general reasoning with fast tool calling and structured output.",
    chips: ["Agent", "Tool use", "Vision", "+ 3 more"],
    sample: {
      user: "Summarize last week's deploys and flag anything risky.",
      steps: ["Read 12 deploy records", "Checked rollback events"],
      answer: "Two deploys stand out as risky:",
      table: {
        header: ["Deploy", "Risk", "Reason"],
        rows: [
          ["billing-v3", "High", "Touched payment retries"],
          ["web-i18n", "Medium", "Locale fallback change"],
        ],
      },
    },
  },
  {
    id: "google",
    label: "Google",
    color: "#1c69e0",
    mark: "G",
    model: "Gemini 3.8 Flash",
    blurb: "Long-context analysis across huge documents and codebases.",
    chips: ["Agent", "Long context", "Vision", "+ 2 more"],
    sample: {
      user: "Find every contract with an auto-renewal clause.",
      steps: ["Read 9 uploaded PDFs", "Extracted renewal terms"],
      answer: "Four contracts auto-renew:",
      table: {
        header: ["Contract", "Renews", "Notice"],
        rows: [
          ["Cloud hosting", "Mar 1", "30 days"],
          ["Analytics", "Apr 15", "60 days"],
        ],
      },
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    color: "#4d6bfe",
    mark: "DS",
    model: "DeepSeek V4 Pro",
    blurb: "Cost-efficient coding and math with strong step-by-step reasoning.",
    chips: ["Agent", "Code", "Reasoning"],
    sample: {
      user: "Optimize this query — it takes 40 seconds.",
      steps: ["Read the query plan", "Analyzed index usage"],
      answer: "The plan scans 2.1M rows twice:",
      table: {
        header: ["Fix", "Impact"],
        rows: [
          ["Composite index (user_id, created_at)", "−38s"],
          ["Rewrite the correlated subquery as a join", "−1.5s"],
        ],
      },
    },
  },
  {
    id: "moonshot",
    label: "Moonshot AI",
    color: "#7c5cff",
    mark: "月",
    model: "Kimi K3",
    blurb: "Bilingual strength for Chinese and English document workflows.",
    chips: ["Agent", "Long context", "Files"],
    sample: {
      user: "Translate the onboarding doc and keep the tone.",
      steps: ["Read onboarding.md", "Preserved formatting"],
      answer: "Translated 14 sections, tone preserved:",
      table: {
        header: ["Section", "Status"],
        rows: [
          ["Getting started", "Translated"],
          ["API keys", "Translated"],
        ],
      },
    },
  },
  {
    id: "qwen",
    label: "Qwen",
    color: "#b45309",
    mark: "Q",
    model: "Qwen 4 Coder",
    blurb: "Fast code completion and repo-wide refactors at low latency.",
    chips: ["Agent", "Code", "Fast"],
    sample: {
      user: "Rename getUserData across the repo without breaking imports.",
      steps: ["Found 23 references", "Updated 6 files"],
      answer: "Renamed to fetchUserProfile with all imports updated:",
      table: {
        header: ["File", "Refs"],
        rows: [
          ["lib/user/api.ts", "9"],
          ["hooks/queries/use-user.ts", "7"],
        ],
      },
    },
  },
];

export function ModelsCatalog() {
  const [active, setActive] = useState(0);
  const lab = LABS[active];

  return (
    <section id="models" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
          {/* Left column */}
          <div>
            <Eyebrow>Model catalog</Eyebrow>
            <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
              Every Frontier Model, <AccentSpan>Ready To Work</AccentSpan>
            </h2>
            <p className="mt-5 max-w-[54ch] text-lg/8 text-(--paper)/60">
              Pick from 30+ models by Anthropic, OpenAI, Google, DeepSeek and
              more. Each one works with the same chats, files, tools and agents.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`${APP_URL}/sign-up`}
                className="bs-btn h-10 rounded-full px-5 text-sm [--surface-base:#fbfbfa]"
              >
                Try every model free
              </Link>
              <Link
                href="/pricing"
                className="bs-btn h-10 rounded-full px-5 text-sm [--surface-base:#e6e6e3]"
              >
                Compare plans
              </Link>
            </div>
            <ul className="mt-10 grid gap-x-6 gap-y-3 border-t border-black/10 pt-8 sm:grid-cols-2">
              {[
                "Switch models in one thread",
                "Images, PDFs and sheets",
                "Web search and browsing",
                "Reasoning models",
                "MCP tool use",
                "Fallback if a model fails",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2.5 text-sm text-(--paper)/75"
                >
                  <span className="size-1.5 rounded-full bg-(--brand)" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: tray card with icon tab rail */}
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="rounded-[14px] bg-white">
              <div className="flex">
                {/* Icon rail */}
                <div
                  role="tablist"
                  aria-label="Model labs"
                  className="flex shrink-0 flex-col gap-1 border-r border-black/[0.06] p-2 sm:w-14"
                >
                  {LABS.map((l, i) => (
                    <button
                      key={l.id}
                      role="tab"
                      id={`lab-tab-${i}`}
                      aria-selected={active === i}
                      aria-controls="lab-panel"
                      onClick={() => setActive(i)}
                      title={l.label}
                      className={cn(
                        "grid size-10 place-items-center rounded-lg text-sm font-bold transition-colors sm:size-12",
                        active === i
                          ? "bg-(--ink-2) text-(--paper) shadow-[inset_0_-2px_0_(--brand)]"
                          : "text-(--paper)/50 hover:bg-(--ink-2) hover:text-(--paper)",
                      )}
                      style={
                        active === i
                          ? { boxShadow: "inset 0 -2px 0 " + l.color }
                          : undefined
                      }
                    >
                      <span
                        style={{ color: active === i ? l.color : undefined }}
                      >
                        {l.mark}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Panel */}
                <div
                  id="lab-panel"
                  role="tabpanel"
                  aria-labelledby={`lab-tab-${active}`}
                  className="relative min-h-[520px] flex-1 p-5 sm:p-6"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid size-6 place-items-center rounded-md text-xs font-bold text-white"
                      style={{ background: lab.color }}
                    >
                      {lab.mark}
                    </span>
                    <h3 className="font-mono text-lg text-(--paper)">
                      {lab.model}
                    </h3>
                  </div>
                  <p className="mt-1.5 text-sm text-(--paper)/60">
                    {lab.blurb}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lab.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md bg-(--ink-2) px-2 py-1 text-[11px] font-medium text-(--paper)/70"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  {/* Sample chat */}
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--ink-2) text-[11px] font-semibold text-(--paper)">
                        J
                      </span>
                      <div>
                        <p className="text-[11px] text-(--paper)/50">Jordan</p>
                        <p className="mt-0.5 rounded-xl bg-(--ink-2) px-3 py-2 text-sm/6 text-(--paper)">
                          {lab.sample.user}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: lab.color }}
                      >
                        {lab.mark}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-(--paper)/50">
                          {lab.model}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {lab.sample.steps.map((step) => (
                            <li
                              key={step}
                              className="flex items-center gap-1.5 text-xs text-(--paper)/60"
                            >
                              <span className="size-1 rounded-full bg-(--brand)" />
                              {step}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-sm/6 text-(--paper)">
                          {lab.sample.answer}
                        </p>
                        {lab.sample.table && (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-black/[0.08]">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="bg-(--ink-2)/60">
                                  {lab.sample.table.header.map((h) => (
                                    <th
                                      key={h}
                                      className="px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-(--paper)/55 uppercase"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {lab.sample.table.rows.map((row) => (
                                  <tr
                                    key={row[0]}
                                    className="border-t border-black/[0.05]"
                                  >
                                    {row.map((cell) => (
                                      <td
                                        key={cell}
                                        className="px-3 py-2 text-(--paper)/75"
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom fade */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-[12px] bg-linear-to-t from-white to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
