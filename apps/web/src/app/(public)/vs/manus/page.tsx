import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus, Cpu, Layers, Workflow } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

export const metadata: Metadata = {
  title: "Void Agent vs Manus AI — Autonomous Agent Platform Comparison (2026)",
  description:
    "An honest, fact-grounded comparison of Void Agent and Manus AI across architecture, model freedom, tool extensibility, and pricing.",
  alternates: { canonical: "/vs/manus" },
  openGraph: { type: "article", title: "Void Agent vs Manus AI" },
};

const MATRIX_ROWS: {
  capability: string;
  us: string;
  them: string;
  winner?: "them";
}[] = [
  {
    capability: "Core Architecture",
    us: "Autonomous Cloud Agent in isolated Linux sandboxes (E2B / Daytona)",
    them: "Autonomous Cloud Agent in sandboxed browser & VM environment",
  },
  {
    capability: "Frontier Model Access",
    us: "Multi-Model (Claude 3.7 Sonnet, Claude Opus, GPT-4o, Gemini 2.5, DeepSeek V3/R1)",
    them: "Proprietary single-model / closed orchestration pipeline",
  },
  {
    capability: "Model Switching in Same Thread",
    us: "Yes — switch between Anthropic, OpenAI, Google, and DeepSeek mid-task",
    them: "No — fixed to Manus's internal reasoning model",
  },
  {
    capability: "Parallel Sub-Agent Swarms (Wide Research)",
    us: "In Development (Q4 2026) — currently focused on deep single-agent execution",
    them: "Yes — native Wide Research multi-agent parallel search",
    winner: "them",
  },
  {
    capability: "Full-Stack Web App Building & 3D Games",
    us: "Yes — Next.js, React, Node.js, Python, Three.js WebGL with live preview URLs",
    them: "Yes — code generation, full-stack app prototyping, and deployment",
  },
  {
    capability: "Real-Time Terminal & Shell Execution",
    us: "Yes — live terminal stdout/stderr streaming and error self-healing",
    them: "Yes — containerized shell execution",
  },
  {
    capability: "Extensibility & Custom Tools",
    us: "Open Model Context Protocol (MCP) servers + Visual node workflow builder",
    them: "Predefined tool connectors and integrations",
  },
  {
    capability: "Document, Slide & Interactive Canvas",
    us: "Full interactive visual canvas editor, web apps, markdown, PDF, DOCX, and PPTX",
    them: "Presentations, documents, spreadsheets, and web apps",
  },
  {
    capability: "Free Tier / Accessibility",
    us: "Generous $0 Free Tier (5 daily agent preview runs, no waitlist or credit card)",
    them: "Limited waitlist / invite-only access or upfront paid subscription",
  },
  {
    capability: "Standard Entry Pricing",
    us: "$10/mo (Plus: 30 runs) • $25/mo (Pro: 150 runs, MCP) • $60/mo (Scale: 600 runs)",
    them: "Reportedly starts at $20 to $40+/mo for standard allocations",
  },
];

const DEEP_DIVE = [
  {
    icon: Cpu,
    kicker: "ARCHITECTURAL FLEXIBILITY",
    title: "Model Agnosticism vs. Single-Vendor Lock-In",
    body: "The single biggest differentiator between Void Agent and Manus is model freedom. Manus operates as a closed vertical stack: you delegate tasks to Manus's orchestrator, which relies on a fixed internal reasoning model. You cannot benchmark how Claude Sonnet would handle a code refactoring task versus GPT-4o or DeepSeek V3.",
    body2:
      "Void Agent gives you multi-model access inside the same conversation and agent loop. If an agent hits a subtle distributed systems issue, you can execute with Anthropic Claude Opus or switch to DeepSeek for high-accuracy reasoning — mid-task, with full history.",
  },
  {
    icon: Layers,
    kicker: "LINUX MICROVM EXECUTION",
    title: "Cloud Sandboxes, Live Preview URLs & Real 3D Games",
    body: "Both platforms run work in isolated cloud sandboxes. Void Agent's sandbox exposes a real dev environment: Node.js, Python, git, a live terminal with stdout/stderr streaming, error self-healing, and reverse-proxy preview URLs for the apps it builds — including WebGL 3D content rendered headlessly.",
    body2:
      "You watch every step, press Stop instantly, or hand off a new instruction while the task is still running.",
  },
  {
    icon: Workflow,
    kicker: "OBJECTIVE CAPABILITY AUDIT",
    title: "Wide Research & Multi-Agent Swarms: An Honest Look",
    body: "Manus ships native Wide Research multi-agent parallel search today, and that is a real capability we do not match yet. Full parallel sub-agent swarms are on our roadmap for Q4 2026. We would rather ship it working than demo it early.",
    body2:
      "Where we already lead is deep single-agent execution: one agent with its own machine, real terminal access, MCP tool freedom and model switching — the shape most real workloads need.",
  },
];

export default function VsManusPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* 1. Hero */}
      <section
        className="border-b border-black/[0.06] pt-36 pb-20 sm:pt-44 sm:pb-28"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(18,18,18,0.22) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <p className="font-mono text-xs tracking-[0.14em] text-(--paper)/50 uppercase">
            <Link href="/" className="hover:text-(--paper)">
              Void Agent
            </Link>{" "}
            / Comparisons /{" "}
            <span className="font-bold text-(--paper)">vs Manus AI</span>
          </p>
          <Eyebrow>Competitive intelligence // 2026 benchmark</Eyebrow>
          <h1 className="mt-5 text-5xl leading-[1.05] font-normal tracking-[-0.035em] text-balance text-(--paper) sm:text-6xl">
            Void Agent vs Manus AI:{" "}
            <AccentSpan>The Autonomous Agent Breakdown.</AccentSpan>
          </h1>
          <p className="mt-6 max-w-[70ch] text-lg/8 text-pretty text-(--paper)/60">
            Looking for an autonomous AI agent platform? Both Void Agent and
            Manus run multi-step tasks inside isolated cloud sandboxes, build
            full-stack web applications, and deliver finished outputs. Here is
            an honest, fact-grounded breakdown of how they compare in
            architecture, model freedom, tool extensibility, and pricing.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Updated for 2026", "Neutral & Fact-Checked"].map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-black/[0.12] bg-white px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-(--paper)/70 uppercase"
              >
                {badge}
              </span>
            ))}
            <span className="rounded-full border border-[#7e89e6]/40 bg-[#7e89e6]/10 px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-[#2537d5] uppercase">
              $0 Free Tier Available
            </span>
          </div>
        </div>
      </section>

      {/* 2. Executive summary */}
      <section className="bg-(--ink-2) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Executive summary</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            The Core Architectural Trade-Off
          </h2>
          <p className="mt-5 max-w-[70ch] text-lg/8 text-(--paper)/60">
            Both systems provide autonomous cloud execution, but make
            fundamentally different bets on model freedom, tool standards, and
            accessibility.
          </p>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {/* Choose Void Agent */}
            <div className="rounded-[20px] bg-(--ink) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="rounded-[14px] bg-white p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 animate-pulse rounded-full bg-(--brand)" />
                  <span className="rounded-full bg-(--brand)/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-(--brand) uppercase">
                    Multi-model platform
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-medium text-(--paper)">
                  Choose Void Agent if:
                </h3>
                <ul className="mt-5 space-y-3.5">
                  {[
                    [
                      "Multi-model flexibility",
                      "Switch freely between Claude Sonnet, Claude Opus, GPT-4o, Gemini, and DeepSeek in the same thread.",
                    ],
                    [
                      "Open tool extensibility",
                      "Bring your own tools through Model Context Protocol servers, or use the built-in tool server.",
                    ],
                    [
                      "You build 3D games & full-stack apps",
                      "Native Three.js WebGL headless rendering, Next.js prototyping, interactive canvas studio, and live reverse proxy previews.",
                    ],
                    [
                      "Permanent $0 Free Tier",
                      "5 daily agent preview runs, zero waitlist, and no credit card required.",
                    ],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-(--brand)" />
                      <p className="text-sm/6 text-(--paper)/70">
                        <span className="font-medium text-(--paper)">
                          {title}
                        </span>{" "}
                        — {body}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-black/[0.06] pt-4 font-mono text-[11px] tracking-[0.12em] text-(--paper)/45 uppercase">
                  Starting at $0 / mo
                </p>
                <Link
                  href="/sign-up"
                  className="mt-3 inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:bg-(--ink-2)"
                >
                  Try Void Agent Free
                </Link>
              </div>
            </div>

            {/* Choose Manus */}
            <div className="rounded-[20px] bg-(--ink) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="rounded-[14px] bg-white p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full bg-zinc-400" />
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-600 uppercase">
                    Single engine swarm
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-medium text-(--paper)">
                  Choose Manus if:
                </h3>
                <ul className="mt-5 space-y-3.5">
                  {[
                    [
                      "Parallel sub-agent swarms",
                      "Native Wide Research multi-agent parallel search, shipped today.",
                    ],
                    [
                      "All-in-one proprietary bundle",
                      "One vendor, one engine — no model benchmarking or switching.",
                    ],
                    [
                      "Waitlist or enterprise budget",
                      "Access today is invite-based or paid upfront.",
                    ],
                    [
                      "Slide presentations",
                      "Deck generation is a first-class output.",
                    ],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <Minus className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                      <p className="text-sm/6 text-(--paper)/70">
                        <span className="font-medium text-(--paper)">
                          {title}
                        </span>{" "}
                        — {body}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-black/[0.06] pt-4 font-mono text-[11px] tracking-[0.12em] text-(--paper)/45 uppercase">
                  Reported $20-$40+ / mo · Invite / waitlist
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Comparison matrix */}
      <section className="bg-(--ink) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Comprehensive matrix</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Side-by-Side Feature Comparison
          </h2>
          <p className="mt-5 max-w-[70ch] text-lg/8 text-(--paper)/60">
            Detailed breakdown across core runtime, model freedom, developer
            tools, and economics.
          </p>
          <div className="mt-12 overflow-x-auto rounded-[20px] border border-black/[0.08] bg-white shadow-sm">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-(--ink-2)">
                  <th className="w-1/4 px-5 py-4 font-mono text-[11px] tracking-[0.12em] text-black/60 uppercase">
                    Capability
                  </th>
                  <th className="w-3/8 px-5 py-4 text-[13px] font-semibold text-(--brand)">
                    Void Agent
                  </th>
                  <th className="w-3/8 px-5 py-4 text-[13px] font-semibold text-black/60">
                    Manus AI
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {MATRIX_ROWS.map((row) => (
                  <tr key={row.capability} className="hover:bg-black/[0.015]">
                    <td className="px-5 py-4 align-top font-medium text-black/70">
                      {row.capability}
                    </td>
                    <td className="bg-[#7e89e6]/[0.08] px-5 py-4 align-top text-black/75">
                      {row.us}
                    </td>
                    <td
                      className={`px-5 py-4 align-top ${row.winner === "them" ? "bg-zinc-50 text-black/75" : "text-black/60"}`}
                    >
                      {row.them}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Deep dive */}
      <section className="bg-(--ink-2) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Engineering deep dive</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Architectural Analysis & Design Choices
          </h2>
          <p className="mt-5 max-w-[70ch] text-lg/8 text-(--paper)/60">
            How our engineering philosophy differs from single-vendor agent
            systems.
          </p>
          <div className="mt-12 space-y-4">
            {DEEP_DIVE.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-black/[0.07] bg-white p-6 sm:p-8"
              >
                <div className="flex flex-col gap-5 sm:flex-row">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#7e89e6]/10 text-(--brand)">
                    <card.icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.14em] text-(--brand) uppercase">
                      {card.kicker}
                    </p>
                    <h3 className="mt-2 text-xl font-medium text-(--paper)">
                      {card.title}
                    </h3>
                    <p className="mt-3 text-sm/7 text-(--paper)/65">
                      {card.body}
                    </p>
                    <p className="mt-3 text-sm/7 text-(--paper)/65">
                      {card.body2}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Pricing transparency */}
      <section className="bg-(--ink) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Pricing & transparency</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Transparent Quotas vs. Opaque Credits
          </h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-8">
              <span className="rounded-full bg-(--brand)/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-(--brand) uppercase">
                Transparent quotas
              </span>
              <h3 className="mt-4 text-lg font-medium text-(--paper)">
                Void Agent
              </h3>
              <dl className="mt-5 divide-y divide-black/[0.06]">
                {[
                  [
                    "Free — $0/mo",
                    "5 daily agent preview runs, multi-model chat, no waitlist or credit card required.",
                  ],
                  [
                    "Plus — $10/mo",
                    "30 agent runs (10 min runtime), 10M tokens, Claude & GPT access.",
                  ],
                  [
                    "Pro — $25/mo",
                    "150 agent runs (30 min runtime), 40M tokens, persistent sandboxes, Model Context Protocol (MCP).",
                  ],
                  [
                    "Scale — $60/mo",
                    "600 agent runs (60 min runtime), 150M tokens, 5 concurrent executions.",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="py-3.5">
                    <dt className="text-sm font-medium text-(--paper)">{k}</dt>
                    <dd className="mt-1 text-sm/6 text-(--paper)/60">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-8">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-600 uppercase">
                Invite / credit based
              </span>
              <h3 className="mt-4 text-lg font-medium text-(--paper)">
                Manus AI
              </h3>
              <dl className="mt-5 divide-y divide-black/[0.06]">
                {[
                  [
                    "Waitlist access",
                    "Limited invite-only onboarding, or upfront paid subscription.",
                  ],
                  [
                    "Subscription tiers",
                    "Reportedly starts at $20 to $40+/mo for standard allocations.",
                  ],
                  [
                    "Dynamic credit burn",
                    "Complex credit consumption per task type and duration.",
                  ],
                  [
                    "Single model ecosystem",
                    "No user-facing model choice or switching.",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="py-3.5">
                    <dt className="text-sm font-medium text-(--paper)">{k}</dt>
                    <dd className="mt-1 text-sm/6 text-(--paper)/60">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Final CTA */}
      <section className="bg-(--ink) pb-24 sm:pb-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="rounded-[14px] bg-white px-6 py-16 text-center sm:py-20">
              <Eyebrow>Start building today</Eyebrow>
              <h2 className="mx-auto mt-5 max-w-[24ch] text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
                Experience Autonomous Multi-Model Agents on{" "}
                <AccentSpan>Void Agent</AccentSpan>
              </h2>
              <p className="mx-auto mt-5 max-w-[60ch] text-lg/8 text-pretty text-(--paper)/60">
                Get access to cloud Linux sandboxes, 30+ frontier models, and
                open MCP tool integrations. No waitlist, no credit card
                required.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/sign-up"
                  className="bs-btn h-11 rounded-lg px-6 text-[15px] [--surface-base:#fbfbfa]"
                >
                  Start Building Free
                </Link>
                <Link
                  href="/pricing"
                  className="bs-btn h-11 rounded-lg px-6 text-[15px] [--surface-base:#e6e6e3]"
                >
                  View Pricing Plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
