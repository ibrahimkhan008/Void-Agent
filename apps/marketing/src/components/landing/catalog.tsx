"use client";

import {
  AnthropicLogo,
  DeepSeekLogo,
  GoogleLogo,
  MoonshotLogo,
  OpenAILogo,
  QwenLogo,
} from "@/components/landing/ai-logos";
import { Button, EASE, Eyebrow, MONO, Section } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import {
  type Icon,
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconCpu,
  IconPlug,
  IconRefresh,
  IconUpload,
  IconWorld,
} from "@tabler/icons-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { APP_URL } from "lib/site";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

const ADVANCE_SECONDS = 5;

type Category = {
  label: string;
  mark: (props: { className?: string }) => ReactNode;
  model: string;
  description: string;
  kind: string;
  chips: string[];
  more: number;
  user: { name: string; question: string };
  steps: string[];
  intro: string;
  table: { title: string; columns: string[]; rows: string[][] };
};

const CATEGORIES: Category[] = [
  {
    label: "Anthropic",
    mark: AnthropicLogo,
    model: "claude-sonnet-5.5",
    description:
      "Careful writing, long tasks and code. The default brain for Cloud Agent.",
    kind: "Chat",
    chips: ["Agent", "Image input", "Tool use", "+ 4 more"],
    more: 4,
    user: {
      name: "Jordan",
      question: "Which of our open bugs block the release?",
    },
    steps: ["Read 64 open GitHub issues", "Checked the release milestone"],
    intro: "These four need a fix before Friday:",
    table: {
      title: "Release blockers",
      columns: ["Issue", "Area", "Problem", "Opened", "Priority"],
      rows: [
        ["#482", "Auth", "Safari login crash", "3d", "High"],
        ["#477", "Billing", "Double charge on retry", "5d", "High"],
        ["#469", "Export", "CSV drops emoji", "1w", "Medium"],
        ["#455", "UI", "Sidebar flicker", "2w", "Low"],
      ],
    },
  },
  {
    label: "OpenAI",
    mark: OpenAILogo,
    model: "gpt-6.1-sol",
    description:
      "Strong general reasoning with fast tool calling and structured output.",
    kind: "Reasoning",
    chips: ["Agent", "Tool use", "Vision", "+ 3 more"],
    more: 3,
    user: {
      name: "Alex",
      question: "Summarize last week's deploys and flag anything risky.",
    },
    steps: ["Read 12 deploy records", "Checked rollback events"],
    intro: "Two deploys stand out as risky:",
    table: {
      title: "Risky deploys",
      columns: ["Deploy", "Risk", "Reason"],
      rows: [
        ["billing-v3", "High", "Touched payment retries"],
        ["web-i18n", "Medium", "Locale fallback change"],
      ],
    },
  },
  {
    label: "Google",
    mark: GoogleLogo,
    model: "gemini-3.8-flash",
    description: "Long-context analysis across huge documents and codebases.",
    kind: "Long context",
    chips: ["Agent", "Long context", "Vision", "+ 2 more"],
    more: 4,
    user: {
      name: "Taylor",
      question: "Find every contract with an auto-renewal clause.",
    },
    steps: ["Read 9 uploaded PDFs", "Extracted renewal terms"],
    intro: "Four contracts auto-renew:",
    table: {
      title: "Auto-renewals",
      columns: ["Contract", "Renews", "Notice"],
      rows: [
        ["Cloud hosting", "Mar 1", "30 days"],
        ["Analytics", "Apr 15", "60 days"],
      ],
    },
  },
  {
    label: "DeepSeek",
    mark: DeepSeekLogo,
    model: "deepseek-v4-pro",
    description:
      "Cost-efficient coding and math with strong step-by-step reasoning.",
    kind: "Code",
    chips: ["Agent", "Code", "Reasoning"],
    more: 3,
    user: {
      name: "Riley",
      question: "Optimize this query — it takes 40 seconds.",
    },
    steps: ["Read the query plan", "Analyzed index usage"],
    intro: "The plan scans 2.1M rows twice:",
    table: {
      title: "Query plan",
      columns: ["Fix", "Impact"],
      rows: [
        ["Composite index (user_id, created_at)", "−38s"],
        ["Rewrite the correlated subquery as a join", "−1.5s"],
      ],
    },
  },
  {
    label: "Moonshot AI",
    mark: MoonshotLogo,
    model: "kimi-k3",
    description:
      "Bilingual strength for Chinese and English document workflows.",
    kind: "Bilingual",
    chips: ["Agent", "Long context", "Files"],
    more: 2,
    user: {
      name: "Sam",
      question: "Translate the onboarding doc and keep the tone.",
    },
    steps: ["Read onboarding.md", "Preserved formatting"],
    intro: "Translated 14 sections, tone preserved:",
    table: {
      title: "Translation",
      columns: ["Section", "Status"],
      rows: [
        ["Getting started", "Translated"],
        ["API keys", "Translated"],
      ],
    },
  },
  {
    label: "Qwen",
    mark: QwenLogo,
    model: "qwen-4-coder",
    description: "Fast code completion and repo-wide refactors at low latency.",
    kind: "Code",
    chips: ["Agent", "Code", "Fast"],
    more: 5,
    user: {
      name: "Casey",
      question: "Rename getUserData across the repo without breaking imports.",
    },
    steps: ["Found 23 references", "Updated 6 files"],
    intro: "Renamed to fetchUserProfile with all imports updated:",
    table: {
      title: "Rename refactor",
      columns: ["File", "Refs"],
      rows: [
        ["lib/user/api.ts", "9"],
        ["hooks/queries/use-user.ts", "7"],
      ],
    },
  },
];

const FEATURES: { icon: Icon; label: string }[] = [
  { icon: IconBolt, label: "Switch models in one thread" },
  { icon: IconUpload, label: "Images, PDFs and sheets" },
  { icon: IconWorld, label: "Web search and browsing" },
  { icon: IconCpu, label: "Reasoning models" },
  { icon: IconPlug, label: "MCP tool use" },
  { icon: IconRefresh, label: "Fallback if a model fails" },
];

export function Catalog() {
  const reduceMotion = !!useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);
  const category = CATEGORIES[active];
  const autoplay = !reduceMotion && !paused && !manual && inView;

  const select = (index: number) => {
    setActive(index);
    setManual(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowDown: (active + 1) % CATEGORIES.length,
      ArrowRight: (active + 1) % CATEGORIES.length,
      ArrowUp: (active - 1 + CATEGORIES.length) % CATEGORIES.length,
      ArrowLeft: (active - 1 + CATEGORIES.length) % CATEGORIES.length,
      Home: 0,
      End: CATEGORIES.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Section
      id="models"
      labelledBy={`${id}-heading`}
      className="py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[2fr_3fr] lg:gap-16">
        <div className="lg:pt-6">
          <Eyebrow>Model catalog</Eyebrow>
          <h2
            id={`${id}-heading`}
            className="mt-6 max-w-[18ch] text-4xl tracking-tight text-balance sm:text-5xl lg:text-4xl xl:text-5xl"
          >
            Every frontier model, <br className="max-sm:hidden" />
            ready to work
          </h2>
          <p className="mt-5 max-w-[44ch] text-base text-pretty text-(--paper)/60">
            Pick from 30+ models by Anthropic, OpenAI, Google, DeepSeek and
            more. Each one works with the same chats, files, tools and agents.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              href={`${APP_URL}/sign-up`}
              variant="secondary"
              scheme="dark"
              size="lg"
              rounded
            >
              Try every model free
              <IconArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button
              href="/pricing"
              variant="outline"
              scheme="dark"
              size="lg"
              rounded
            >
              Compare plans
            </Button>
          </div>
          <ul
            role="list"
            className="mt-12 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-white/[0.06] pt-8 sm:grid-cols-2"
          >
            {FEATURES.map((feature) => (
              <li
                key={feature.label}
                className="flex items-center gap-3 text-sm text-(--paper)/75"
              >
                <feature.icon
                  className="size-4 shrink-0 text-(--paper)/45"
                  stroke={1.75}
                  aria-hidden
                />
                {feature.label}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-[20px] bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="flex flex-col gap-1.5 sm:flex-row lg:h-[580px]">
            <div
              role="tablist"
              aria-label="Model providers"
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="flex shrink-0 gap-1 overflow-x-auto p-1 [scrollbar-width:none] sm:w-14 sm:flex-col sm:overflow-visible"
            >
              {CATEGORIES.map((item, i) => {
                const selected = i === active;
                return (
                  <button
                    key={item.label}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    id={`${id}-tab-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`${id}-panel`}
                    aria-label={item.label}
                    title={item.label}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(i)}
                    className={cn(
                      "group relative grid size-12 shrink-0 place-items-center rounded-xl transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)",
                      selected
                        ? "text-(--paper)"
                        : "text-(--paper)/45 hover:text-(--paper)/80",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId={`${id}-rail`}
                        className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/10"
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: "spring", bounce: 0.15, duration: 0.45 }
                        }
                      />
                    )}
                    <item.mark
                      className={cn(
                        "relative size-6 transition-opacity duration-200",
                        selected
                          ? "opacity-100"
                          : "opacity-70 group-hover:opacity-100",
                      )}
                    />
                    {selected && (
                      <motion.span
                        key={`${active}-${autoplay}`}
                        aria-hidden
                        className="absolute inset-x-3 bottom-1 h-px origin-left rounded-full bg-(--brand)"
                        initial={{
                          scaleX: autoplay ? 0 : 1,
                          opacity: autoplay ? 1 : 0,
                        }}
                        animate={{ scaleX: 1 }}
                        transition={
                          autoplay
                            ? { duration: ADVANCE_SECONDS, ease: "linear" }
                            : { duration: 0 }
                        }
                        onAnimationComplete={() => {
                          if (autoplay)
                            setActive(
                              (current) => (current + 1) % CATEGORIES.length,
                            );
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div
              id={`${id}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-${active}`}
              className="relative grid min-h-[520px] min-w-0 flex-1 overflow-hidden rounded-[14px] bg-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]"
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={active}
                  className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col"
                  initial={{
                    opacity: 0,
                    y: reduceMotion ? 0 : 10,
                    filter: reduceMotion ? "blur(0px)" : "blur(8px)",
                  }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    y: reduceMotion ? 0 : -10,
                    filter: reduceMotion ? "blur(0px)" : "blur(8px)",
                  }}
                  transition={{
                    duration: reduceMotion ? 0.15 : 0.45,
                    ease: EASE,
                  }}
                >
                  <CategoryPane
                    category={category}
                    reduceMotion={reduceMotion}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function CategoryPane({
  category,
  reduceMotion,
}: { category: Category; reduceMotion: boolean }) {
  const stagger = (i: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.4,
      ease: EASE,
      delay: reduceMotion ? 0 : 0.1 + i * 0.07,
    },
  });
  const Mark = category.mark;
  const initials = category.user.name.slice(0, 1);

  return (
    <>
      <motion.div {...stagger(0)} className="border-b border-white/[0.06] p-5">
        <div className="flex items-center gap-2.5">
          <Mark className="size-6 shrink-0" />
          <h3
            className="truncate text-lg font-medium tracking-tight"
            style={MONO}
          >
            {category.model}
          </h3>
        </div>
        <p className="mt-2 max-w-[52ch] text-sm text-pretty text-(--paper)/55">
          {category.description}
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pr-2.5 pl-1.5 text-xs text-(--paper)/80 ring-1 ring-white/10">
            <Mark className="size-3.5" />
            {category.kind}
          </span>
          {category.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-(--paper)/65 ring-1 ring-white/[0.06]"
            >
              {chip}
            </span>
          ))}
          <span className="pl-1 text-xs text-(--paper)/40">
            +{category.more} models
          </span>
        </div>
      </motion.div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-5 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
        <motion.div {...stagger(1)}>
          <p className="flex items-center gap-2 text-sm text-(--paper)/80">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-semibold text-(--paper)">
              {initials}
            </span>
            {category.user.name}
          </p>
          <p className="mt-2 w-fit max-w-[85%] rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-sm text-(--paper)/85">
            {category.user.question}
          </p>
        </motion.div>

        <motion.div {...stagger(2)} className="mt-5">
          <p className="flex items-center gap-2 text-sm font-medium text-(--paper)/90">
            <Mark className="size-4" />
            {category.model}
          </p>
          <ul role="list" className="mt-2 space-y-1">
            {category.steps.map((step) => (
              <li
                key={step}
                className="flex items-center gap-2 text-xs text-(--paper)/50"
              >
                <IconCheck
                  className="size-3 text-(--brand)"
                  stroke={2.5}
                  aria-hidden
                />
                {step}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-(--paper)/85">{category.intro}</p>
        </motion.div>

        <motion.div
          {...stagger(3)}
          className="mt-4 border-t border-white/[0.06] pt-4"
        >
          <p className="text-sm font-medium text-(--paper)/90">
            {category.table.title}
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-white/10 [scrollbar-width:none]">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-white/[0.04] text-(--paper)/60">
                <tr>
                  {category.table.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-r border-white/[0.06] px-3 py-2.5 font-medium last:border-r-0"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-(--paper)/80">
                {category.table.rows.map((row) => (
                  <tr key={row[0]} className="border-t border-white/[0.06]">
                    {row.map((cell, i) => (
                      <td
                        key={i}
                        className="border-r border-white/[0.06] px-3 py-2.5 tabular-nums last:border-r-0"
                        style={i === 0 ? MONO : undefined}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </>
  );
}
