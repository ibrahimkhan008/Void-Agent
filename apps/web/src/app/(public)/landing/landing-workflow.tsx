import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

/* ─── 4. #workflows — canvas demo in a browser-frame tray ────────────────── */

function WorkflowNode({
  title,
  subtitle,
  icon,
  color,
  className,
  wide,
}: {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`absolute flex items-center gap-2.5 rounded-xl border-2 border-[#d6d6d1] bg-white px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${wide ? "w-[220px]" : "w-[170px]"} ${className ?? ""}`}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
        style={{ background: color }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-(--paper)">{title}</p>
        <p className="truncate text-[11px] text-(--paper)/55">{subtitle}</p>
      </div>
      <span className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-[#b9b9b4] bg-white" />
    </div>
  );
}

function SubNode({
  label,
  role,
  color,
  className,
}: { label: string; role: string; color: string; className: string }) {
  return (
    <div
      className={`absolute flex items-center gap-2 rounded-full border border-[#d6d6d1] bg-white py-1.5 pr-3 pl-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] ${className}`}
    >
      <span className="size-5 rounded-full" style={{ background: color }} />
      <div>
        <p className="text-[10px] leading-tight font-semibold text-(--paper)">
          {label}
        </p>
        <p className="text-[9px] leading-tight text-(--paper)/50">{role}</p>
      </div>
    </div>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflows" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <Eyebrow>Workflows</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Wire Up An Agent <AccentSpan>In A Minute</AccentSpan>
          </h2>
          <p className="mt-5 max-w-[60ch] text-lg/8 text-(--paper)/60">
            Drop in a trigger, connect your tools, give the AI Agent a model and
            memory, and branch on the result. Void Agent runs it on its own.
          </p>
        </div>

        {/* Browser-frame tray */}
        <div className="mt-14 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
          <div className="overflow-hidden rounded-[14px] bg-white">
            {/* Toolbar */}
            <div className="flex h-11 items-center justify-between gap-4 border-b border-black/[0.06] px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-xs text-(--paper)/55">
                  Personal /
                </span>
                <span className="truncate text-xs font-medium text-(--paper)">
                  Issue triage
                </span>
                <span className="hidden rounded-md bg-(--ink-2) px-1.5 py-0.5 font-mono text-[10px] text-(--paper)/55 sm:inline">
                  Void Agent
                </span>
              </div>
              <div className="hidden items-center gap-1 rounded-lg bg-(--ink-2) p-1 md:flex">
                <span className="rounded-md bg-white px-3 py-1 text-xs font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
                  Editor
                </span>
                <span className="px-3 py-1 text-xs text-(--paper)/55">
                  Executions
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-(--paper)/55">Active</span>
                <span className="flex h-5 w-9 items-center rounded-full bg-(--brand-glow) p-0.5">
                  <span className="ml-auto size-4 rounded-full bg-white" />
                </span>
              </div>
            </div>

            {/* Canvas stage */}
            <div
              className="relative h-[420px] overflow-hidden bg-[#fafaf8] sm:h-[560px]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #dcdcd7 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              role="img"
              aria-label="Workflow canvas: a schedule trigger feeds a GitHub node, an AI Agent with model, memory and tool inputs, an If branch, then Slack and Library outputs."
            >
              <WorkflowNode
                title="Schedule Trigger"
                subtitle="Weekdays at 9:00"
                icon="⏰"
                color="#ff6d5a"
                className="left-[4%] top-[26%]"
              />
              <WorkflowNode
                title="GitHub"
                subtitle="Get new issues"
                icon="GH"
                color="#24292f"
                className="left-[26%] top-[26%]"
              />
              <WorkflowNode
                title="AI Agent"
                subtitle="Triage and label"
                icon="AI"
                color="#0b7a3f"
                className="left-[46%] top-[24%]"
                wide
              />
              {/* Agent sub-nodes */}
              <SubNode
                label="Claude Sonnet 5.5"
                role="Chat model"
                color="#d97757"
                className="left-[44%] top-[6%]"
              />
              <SubNode
                label="Library"
                role="Memory"
                color="#7c5cff"
                className="left-[44%] top-[48%]"
              />
              <SubNode
                label="Web Search"
                role="Tool"
                color="#0ea5e9"
                className="left-[62%] top-[48%]"
              />
              <WorkflowNode
                title="If"
                subtitle="Is it a bug?"
                icon="?"
                color="#16a34a"
                className="left-[74%] top-[26%]"
              />
              <WorkflowNode
                title="Slack"
                subtitle="Post to #eng-triage"
                icon="SL"
                color="#4a154b"
                className="left-[92%] top-[10%] hidden lg:flex"
              />
              <WorkflowNode
                title="Library"
                subtitle="Save daily report"
                icon="LI"
                color="#0b7a3f"
                className="left-[92%] top-[44%] hidden lg:flex"
              />

              {/* If-branch edge labels */}
              <span className="absolute top-[33%] left-[70%] hidden text-[10px] font-medium text-(--paper)/50 lg:inline">
                true
              </span>
              <span className="absolute top-[43%] left-[70%] hidden text-[10px] font-medium text-(--paper)/50 lg:inline">
                false
              </span>

              {/* Sticky zoom toolbar + execute */}
              <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-black/[0.06] bg-white p-1 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                {["−", "+", "⤢"].map((icon) => (
                  <span
                    key={icon}
                    className="grid size-8 place-items-center rounded-md text-sm text-(--paper)/60 hover:bg-(--ink-2)"
                    aria-hidden
                  >
                    {icon}
                  </span>
                ))}
              </div>
              <span className="absolute right-4 bottom-4 rounded-lg bg-(--paper) px-4 py-2 text-sm font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                Execute workflow
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
          >
            Build your first workflow
          </Link>
          <Link
            href="/docs"
            className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── 5. #network — multi-model world map ────────────────────────────────── */

const PINS = [
  {
    lab: "Anthropic",
    model: "Claude Sonnet 5.5",
    place: "San Francisco",
    x: 18,
    y: 38,
    active: true,
  },
  {
    lab: "Google DeepMind",
    model: "Gemini 3.8 Flash",
    place: "London",
    x: 44,
    y: 30,
  },
  {
    lab: "Void Agent",
    model: "Your workspace",
    place: "India",
    x: 66,
    y: 55,
    active: true,
  },
  {
    lab: "DeepSeek",
    model: "DeepSeek V4 Pro",
    place: "Hangzhou",
    x: 76,
    y: 42,
  },
  { lab: "Moonshot AI", model: "Kimi K3", place: "Beijing", x: 82, y: 36 },
  { lab: "Sarvam AI", model: "Sarvam voice", place: "Bengaluru", x: 68, y: 62 },
];

const NETWORK_POINTS = [
  {
    title: "One thread, any model",
    body: "Switch between Claude, GPT, Gemini, DeepSeek and more without starting over.",
  },
  {
    title: "History that fits each model",
    body: "When you switch, Void Agent adapts the conversation and tool calls so the next model can read them.",
  },
  {
    title: "Automatic fallback",
    body: "If a model fails mid-reply, Void Agent retries on a backup model so the task keeps moving.",
  },
  {
    title: "The right model per task",
    body: "Use a fast model for drafts and a reasoning model for the hard parts, in the same chat.",
  },
];

export function NetworkSection() {
  return (
    <section id="network" className="overflow-hidden pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <Eyebrow>Multi-model</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Every Frontier Lab, One <AccentSpan>Workspace</AccentSpan>
          </h2>
        </div>
        <Link
          href="#models"
          className="mt-8 inline-flex h-10 items-center rounded-full border border-black/[0.15] bg-white px-4 text-sm font-medium text-(--paper) transition-colors hover:bg-(--ink-2)"
        >
          See the models
        </Link>

        {/* Map panel */}
        <div className="relative mt-6 h-[520px] overflow-hidden rounded-[20px] border border-black/[0.06] sm:h-[640px] lg:h-[820px]">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, #d0d0cb 1.2px, transparent 1.2px)",
              backgroundSize: "12px 12px",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-radial-[at_15%_20%] from-(--ink) from-10% to-transparent to-60%"
          />

          {/* Pins */}
          {PINS.map((pin) => (
            <div
              key={pin.lab}
              className="absolute"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              <span
                className={`grid size-8 place-items-center rounded-full ${pin.active ? "bg-(--paper) shadow-[0_2px_10px_rgba(11,122,63,0.35)]" : "bg-white/55"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${pin.active ? "bg-(--brand)" : "bg-(--brand)/55"}`}
                />
              </span>
              <div
                className={`mt-2 rounded-lg px-2.5 py-1.5 ${pin.active ? "bg-linear-to-r from-(--brand) to-(--brand-glow) text-white" : "bg-white/85 text-(--paper)/55"}`}
              >
                <p className="text-xs font-semibold">{pin.model}</p>
                <p className="text-[10px] opacity-80">
                  {pin.lab} · {pin.place}
                </p>
              </div>
            </div>
          ))}

          {/* Stats */}
          <div className="absolute right-6 bottom-6 text-right">
            <p className="text-2xl font-medium tabular-nums text-(--paper)">
              30+
            </p>
            <p className="text-xs text-(--paper)/55">Models available</p>
            <p className="mt-4 text-2xl font-medium tabular-nums text-(--paper)">
              12
            </p>
            <p className="text-xs text-(--paper)/55">AI labs</p>
          </div>

          {/* Map subtitle */}
          <p className="absolute inset-x-6 bottom-6 max-w-md text-sm text-(--paper)/55 lg:bottom-8">
            AI labs whose models run in Void Agent, in the United States, the
            United Kingdom, India and China.
          </p>
        </div>

        {/* 4-up list */}
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {NETWORK_POINTS.map((point) => (
            <div key={point.title} className="border-t border-black/10 pt-5">
              <h3 className="text-base font-medium text-(--paper)">
                {point.title}
              </h3>
              <p className="mt-2 text-sm/6 text-(--paper)/60">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
