"use client";

import {
  LANDSCAPE_SRC,
  VoidAgentMark,
  buttonVariants,
  useLiveSeries,
} from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import {
  type Icon,
  IconBell,
  IconBolt,
  IconBox,
  IconCalendar,
  IconChartBar,
  IconChevronDown,
  IconChevronLeft,
  IconCpu,
  IconDeviceDesktop,
  IconFileText,
  IconHelpCircle,
  IconMapPin,
  IconMenuDeep,
  IconMessage2,
  IconMoon,
  IconPencil,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconRocket,
  IconSearch,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "framer-motion";
import { Liveline } from "liveline";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

const MAIN_NAV: {
  label: string;
  icon: Icon;
  count?: number;
  active?: boolean;
}[] = [
  { label: "Chat", icon: IconMessage2 },
  { label: "Agents", icon: IconRocket, active: true },
  { label: "Models", icon: IconBox },
  { label: "Schedules", icon: IconCalendar, count: 3 },
  { label: "Usage", icon: IconChartBar },
  { label: "Files", icon: IconFileText },
];

const RECENT = [
  "Build a Next.js dashboard for Stripe data",
  "Triage the open GitHub bugs",
  "Clean up last week's CSV exports",
  "Draft the changelog from merged PRs",
  "Rename getUserData across the repo",
  "Compare flight options for Friday",
];

const TABS = ["All agents", "Mine", "Shared", "Gallery"];

const USAGE = [
  62, 58, 64, 60, 55, 57, 52, 54, 50, 53, 49, 51, 48, 50, 47, 52, 49, 46, 48,
  45, 47, 44, 46, 43,
];
const RUNS = [
  38, 44, 41, 52, 48, 57, 61, 55, 66, 70, 63, 72, 78, 74, 81, 77, 85, 80, 88,
  92,
];

const MODELS: {
  name: string;
  task: string;
  copy: string;
  status: string;
  dot: string;
  role: string;
  art: ReactNode;
}[] = [
  {
    name: "claude-sonnet-5.5",
    task: "Chat",
    copy: "Careful writing, long tasks and code. The default brain for Cloud Agent.",
    status: "Default",
    dot: "bg-emerald-500",
    role: "Primary",
    art: <ChatArt />,
  },
  {
    name: "gpt-6.1-sol",
    task: "Code",
    copy: "Strong general reasoning with fast tool calling and structured output.",
    status: "Active",
    dot: "bg-amber-500",
    role: "Fast drafts",
    art: <CodeArt />,
  },
  {
    name: "gemini-3.8-flash",
    task: "Files",
    copy: "Long-context analysis across huge documents and codebases.",
    status: "Idle",
    dot: "bg-neutral-300",
    role: "Deep reads",
    art: <AudioArt />,
  },
];

const PROVIDERS = [
  { name: "Anthropic", code: "claude", flagship: "Sonnet 5.5", share: "41%" },
  { name: "OpenAI", code: "gpt", flagship: "GPT 6.1", share: "27%" },
  { name: "Google", code: "gemini", flagship: "Gemini 3.8", share: "19%" },
  { name: "Groq", code: "llama", flagship: "Llama 4", share: "13%" },
];

const QUICK_STATS: { label: string; value: string; icon: Icon }[] = [
  { label: "Chats today", value: "128", icon: IconBolt },
  { label: "Agent runs", value: "14", icon: IconRocket },
  { label: "Sandbox hours", value: "2.1", icon: IconCpu },
  { label: "Image drafts", value: "8", icon: IconPhoto },
];

export function Dashboard() {
  const reduceMotion = useReducedMotion();

  const stage = (delay: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: EASE, delay },
  });

  return (
    <div
      role="img"
      aria-label="Void Agent workspace mockup with token usage and agent run charts, model cards, messages by provider and quick stats"
      className="h-[480px] overflow-hidden rounded-2xl bg-white text-[13px] text-neutral-900 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.75)] outline-1 -outline-offset-1 outline-white/10 sm:h-[600px] lg:h-[720px]"
    >
      <div aria-hidden className="flex h-full">
        <motion.div {...stage(0.5)} className="hidden md:flex">
          <Sidebar />
        </motion.div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
          <motion.div
            {...stage(0.6)}
            className="flex shrink-0 items-center justify-between"
          >
            <span
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <IconChevronLeft data-icon="inline-start" />
              Agents
            </span>
            <div className="flex items-center gap-2">
              <span
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <IconBell stroke={1.75} />
              </span>
              <span className={buttonVariants()}>
                <IconPencil data-icon="inline-start" className="size-3.5" />
                New
              </span>
              <span
                className={cn(
                  buttonVariants({ variant: "secondary", size: "icon" }),
                  "max-sm:hidden",
                )}
              >
                <IconMenuDeep stroke={1.75} />
              </span>
            </div>
          </motion.div>

          <motion.div
            {...stage(0.72)}
            className="relative isolate shrink-0 overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-black/[0.06]"
          >
            <img
              src={LANDSCAPE_SRC}
              alt=""
              width={1672}
              height={941}
              className="absolute inset-y-0 right-0 -z-10 hidden h-full w-[62%] object-cover object-[center_60%] [mask-image:linear-gradient(to_right,transparent,black_45%)] sm:block"
            />
            <div className="p-5 sm:p-6">
              <p className="text-xs font-medium text-sky-700">Cloud Agent</p>
              <h3 className="mt-1.5 text-2xl font-semibold tracking-tight">
                Issue triage
              </h3>
              <p className="mt-1.5 max-w-[34ch] text-neutral-500">
                One agent, any model, with your tools and a live sandbox.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <span className={buttonVariants({ size: "lg" })}>
                  <IconPlus data-icon="inline-start" />
                  New agent
                </span>
                <span
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <IconPlayerPlay data-icon="inline-start" />
                  Open chat
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div
            {...stage(0.84)}
            className="flex shrink-0 items-center justify-between gap-3"
          >
            <div className="flex gap-0.5 rounded-xl bg-neutral-100 p-1">
              {TABS.map((tab, i) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-lg px-3 py-1.5 whitespace-nowrap text-neutral-500",
                    i === 0 &&
                      "bg-white font-medium text-neutral-900 shadow-xs ring-1 ring-black/[0.04]",
                    i > 1 && "max-sm:hidden",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
            <span
              className={cn(
                buttonVariants({ variant: "outline" }),
                "max-lg:hidden",
              )}
            >
              <IconCalendar
                data-icon="inline-start"
                className="text-neutral-500"
              />
              Last 7 days
              <IconChevronDown
                data-icon="inline-end"
                className="text-neutral-400"
              />
            </span>
          </motion.div>

          <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="min-w-0 space-y-4">
              <section>
                <SectionTitle icon={IconChartBar} delay={0.96}>
                  Live usage
                </SectionTitle>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <motion.div {...stage(1.04)}>
                    <UsageCard />
                  </motion.div>
                  <motion.div {...stage(1.12)} className="max-sm:hidden">
                    <RunsCard />
                  </motion.div>
                </div>
              </section>

              <section className="max-sm:hidden">
                <SectionTitle icon={IconBox} delay={1.2}>
                  Models
                </SectionTitle>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {MODELS.map((model, i) => (
                    <motion.div
                      key={model.name}
                      {...stage(1.28 + i * 0.08)}
                      className="flex flex-col rounded-xl bg-white p-2.5 ring-1 ring-black/[0.06]"
                    >
                      <div className="grid h-20 place-items-center rounded-lg bg-neutral-50">
                        {model.art}
                      </div>
                      <p className="mt-3 px-1 text-[11px] text-neutral-400">
                        {model.task}
                      </p>
                      <p className="mt-0.5 truncate px-1 font-medium">
                        {model.name}
                      </p>
                      <p className="mt-1 line-clamp-2 px-1 text-xs text-neutral-500">
                        {model.copy}
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] px-1 pt-2.5 text-[11px] text-neutral-500">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn("size-1.5 rounded-full", model.dot)}
                          />
                          {model.status}
                        </span>
                        <span className="tabular-nums">{model.role}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </div>

            <div className="hidden min-w-0 space-y-4 lg:block">
              <section>
                <SectionTitle icon={IconMapPin} delay={1.04}>
                  Messages by provider
                </SectionTitle>
                <ul className="mt-3 divide-y divide-black/[0.05] rounded-xl ring-1 ring-black/[0.06]">
                  {PROVIDERS.map((provider, i) => (
                    <motion.li
                      key={provider.code}
                      {...stage(1.12 + i * 0.06)}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-100">
                        <IconMessage2
                          className="size-3.5 text-neutral-500"
                          stroke={1.75}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {provider.name}
                        </span>
                        <span className="block text-[11px] text-neutral-400">
                          {provider.code} · {provider.share} of messages
                        </span>
                      </span>
                      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 tabular-nums">
                        {provider.flagship}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </section>

              <section>
                <SectionTitle icon={IconBolt} delay={1.36}>
                  Quick stats
                </SectionTitle>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {QUICK_STATS.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      {...stage(1.44 + i * 0.06)}
                      className="flex items-center gap-2.5 rounded-xl p-3 ring-1 ring-black/[0.06]"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-100">
                        <stat.icon
                          className="size-3.5 text-neutral-500"
                          stroke={1.75}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold tabular-nums">
                          {stat.value}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-400">
                          {stat.label}
                        </span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  delay,
  children,
}: {
  icon: Icon;
  delay: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.h4
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className="flex items-center gap-2 text-sm font-medium"
    >
      <Icon className="size-4 text-neutral-500" stroke={1.75} />
      {children}
    </motion.h4>
  );
}

function Sidebar() {
  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-black/[0.06] bg-neutral-50/80 p-3">
      <div className="flex items-center gap-2.5 px-1">
        <VoidAgentMark className="size-8" />
        <span>
          <span className="block font-semibold leading-tight">Void Agent</span>
          <span className="block text-[11px] text-neutral-400">Cloud</span>
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-neutral-400 ring-1 ring-black/[0.06]">
        <IconSearch className="size-3.5" />
        Search
        <span className="ml-auto rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">
          ⌘K
        </span>
      </div>

      <p className="mt-4 px-2 text-[11px] text-neutral-400">Main</p>
      <ul className="mt-1.5 space-y-0.5">
        {MAIN_NAV.map(({ label, icon: Icon, count, active }) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-neutral-600",
              active && "bg-neutral-950 text-white",
            )}
          >
            <Icon className="size-4 shrink-0" stroke={1.75} />
            {label}
            {count && (
              <span className="ml-auto rounded bg-neutral-200/70 px-1 text-[10px] text-neutral-500 tabular-nums">
                {count}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-black/[0.06] pt-3">
        <p className="flex items-center justify-between px-2 font-medium">
          Recent runs
          <IconChevronDown className="size-3.5 text-neutral-400" />
        </p>
        <ul className="mt-2 ml-3 space-y-1.5 border-l border-black/[0.08] pl-3 text-xs text-neutral-500">
          {RECENT.map((item) => (
            <li key={item} className="truncate">
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto space-y-0.5 border-t border-black/[0.06] pt-3 text-neutral-600">
        {[
          { label: "Settings", icon: IconSettings },
          { label: "Help center", icon: IconHelpCircle },
        ].map(({ label, icon: Icon }) => (
          <p key={label} className="flex items-center gap-2.5 px-2 py-1.5">
            <Icon className="size-4" stroke={1.75} />
            {label}
            <IconChevronDown className="ml-auto size-3.5 text-neutral-400" />
          </p>
        ))}
        <div className="mt-2 rounded-lg bg-white p-1.5 ring-1 ring-black/[0.06]">
          <div className="flex items-center gap-2 p-1">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-neutral-200 text-[10px] font-semibold text-neutral-600">
              JD
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                Jordan Ellis
              </span>
              <span className="block truncate text-[10px] text-neutral-400">
                jordan@studio.dev
              </span>
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-md bg-neutral-100 p-0.5 text-[10px] text-neutral-500">
            {[
              { label: "Light", icon: IconSun, active: true },
              { label: "Dark", icon: IconMoon },
              { label: "System", icon: IconDeviceDesktop },
            ].map(({ label, icon: Icon, active }) => (
              <span
                key={label}
                className={cn(
                  "flex items-center justify-center gap-1 rounded py-1",
                  active && "bg-neutral-950 text-white",
                )}
              >
                <Icon className="size-3" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const seedUsage = () => USAGE;
const stepUsage = (previous: number) =>
  Math.min(
    64,
    Math.max(40, previous + (46 - previous) * 0.15 + (Math.random() - 0.5) * 6),
  );

function UsageCard() {
  const reduceMotion = useReducedMotion();
  const data = useLiveSeries({
    seed: seedUsage,
    step: stepUsage,
    intervalMs: 900,
    active: !reduceMotion,
  });
  const value = data[data.length - 1]?.value ?? 0;

  return (
    <div className="rounded-xl p-4 ring-1 ring-black/[0.06]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">Token usage</p>
          <p className="text-[11px] text-neutral-400">This week</p>
        </div>
        <div className="flex gap-0.5 rounded-md bg-neutral-100 p-0.5 text-[10px] text-neutral-500">
          {["1d", "7d", "30d"].map((range) => (
            <span
              key={range}
              className={cn(
                "rounded px-1.5 py-0.5",
                range === "7d" && "bg-neutral-950 text-white",
              )}
            >
              {range}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        64<span className="ml-0.5 text-sm font-normal text-neutral-400">%</span>
      </p>
      <p className="text-[11px] text-emerald-600">18% below last week</p>
      <div className="mt-3 h-16">
        <Liveline
          data={data}
          value={value}
          loading={data.length === 0}
          theme="light"
          color="#0099ff"
          window={20}
          grid={false}
          badge={false}
          momentum={false}
          scrub={false}
          lineWidth={1.5}
          padding={{ top: 6, right: 8, bottom: 6, left: 0 }}
          lerpSpeed={reduceMotion ? 1 : 0.08}
        />
      </div>
    </div>
  );
}

function RunsCard() {
  return (
    <div className="flex h-full flex-col rounded-xl p-4 ring-1 ring-black/[0.06]">
      <p className="font-medium">Agent runs</p>
      <p className="text-[11px] text-neutral-400">Cloud Agent this week</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        38
        <span className="ml-1 text-sm font-normal text-neutral-400">runs</span>
      </p>
      <p className="text-[11px] text-neutral-500">Peak 12 on Tuesday</p>
      <div className="mt-auto flex h-16 items-end gap-[3px] pt-3">
        {RUNS.map((value, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[2px]",
              i === RUNS.length - 1 ? "bg-neutral-900" : "bg-neutral-200",
            )}
            style={{ height: `${value}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ChatArt() {
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20 text-neutral-400" fill="none">
      <rect
        x="6"
        y="6"
        width="44"
        height="22"
        rx="6"
        className="fill-white stroke-current"
      />
      <path
        d="M14 14h28M14 20h18"
        className="stroke-current"
        strokeLinecap="round"
      />
      <rect
        x="30"
        y="22"
        width="44"
        height="20"
        rx="6"
        className="fill-neutral-900"
      />
      <path
        d="M38 30h26M38 35h16"
        className="stroke-white/70"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeArt() {
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20 text-neutral-400" fill="none">
      <rect
        x="10"
        y="6"
        width="60"
        height="36"
        rx="6"
        className="fill-white stroke-current"
      />
      <path
        d="M26 18l-6 6 6 6M54 18l6 6-6 6"
        className="stroke-neutral-900"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44 15l-8 18"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AudioArt() {
  const bars = [8, 16, 26, 14, 30, 20, 34, 18, 24, 12, 20, 8];
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20" fill="none">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={9 + i * 5.4}
          y={24 - h / 2}
          width="3"
          height={h}
          rx="1.5"
          className={i === 6 ? "fill-neutral-900" : "fill-neutral-300"}
        />
      ))}
    </svg>
  );
}
