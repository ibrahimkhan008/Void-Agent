"use client";

import {
  Button,
  EASE,
  LANDSCAPE_SRC,
  Section,
  badgeVariants,
} from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { APP_URL } from "lib/site";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

type Feature = {
  tab: string;
  description: string;
  card: {
    label: string;
    status: { text: string; tone: "success" | "warning" | "info" };
    value: ReactNode;
    meta: string;
    visual: ReactNode;
  };
  frame: { scale: number; x: string; y: string };
};

const FEATURES: Feature[] = [
  {
    tab: "Switch models mid-thread",
    description:
      "Claude, GPT, Gemini and 30+ more in one thread. Switch any time without starting over.",
    card: {
      label: "Claude Sonnet 5.5",
      status: { text: "Live", tone: "success" },
      value: <Unit value="30+" unit="models" />,
      meta: "Switched 14 times in one thread",
      visual: <SwitchSteps />,
    },
    frame: { scale: 1.04, x: "0%", y: "0%" },
  },
  {
    tab: "Run in real sandboxes",
    description:
      "Cloud Agent tasks run on an isolated Linux sandbox with Node.js, Python and git — and give you a live preview link.",
    card: {
      label: "Agent runs today",
      status: { text: "Scaling", tone: "warning" },
      value: <Unit value="14" unit="runs" />,
      meta: "Up from 2 before launch",
      visual: <RunBars />,
    },
    frame: { scale: 1.14, x: "-4%", y: "2%" },
  },
  {
    tab: "Automatic fallback",
    description:
      "If a model fails mid-reply, Void Agent retries on a backup model so the task keeps moving.",
    card: {
      label: "Fallback triggered",
      status: { text: "gpt-6.1-sol", tone: "info" },
      value: <Unit value="1.2" unit="sec" />,
      meta: "Answer kept moving on the second model",
      visual: <FallbackRoutes />,
    },
    frame: { scale: 1.12, x: "4%", y: "-2%" },
  },
  {
    tab: "Weekly quotas, no surprise bills",
    description:
      "Plans come with weekly AI tokens, Cloud Agent launches, sandbox hours and image generations that reset every week.",
    card: {
      label: "Weekly tokens used",
      status: { text: "On quota", tone: "success" },
      value: "64%",
      meta: "of the 4.5M Pro weekly tokens",
      visual: <QuotaSpend />,
    },
    frame: { scale: 1.08, x: "-2%", y: "-3%" },
  },
];

const PANEL_COLUMN = [
  "lg:col-start-1",
  "lg:col-start-2",
  "lg:col-start-3",
  "lg:col-start-4",
];

const STATUS_DOT = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function Features() {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const feature = FEATURES[active];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: (active + 1) % FEATURES.length,
      ArrowLeft: (active - 1 + FEATURES.length) % FEATURES.length,
      Home: 0,
      End: FEATURES.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Section
      id="features"
      labelledBy={`${id}-heading`}
      className="py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <h2
          id={`${id}-heading`}
          className="max-w-[24ch] text-4xl font-medium tracking-tight text-balance sm:text-5xl"
        >
          Built for the way you ship
        </h2>

        <div
          aria-hidden
          className="relative mt-12 aspect-[4/5] overflow-hidden rounded-2xl bg-(--ink-2) outline-1 -outline-offset-1 outline-white/10 sm:mt-16 sm:aspect-[16/9] lg:aspect-[12/5]"
        >
          <motion.img
            src={LANDSCAPE_SRC}
            alt=""
            width={1672}
            height={941}
            loading="lazy"
            initial={false}
            animate={reduceMotion ? { scale: 1.04 } : feature.frame}
            transition={{ duration: 1.4, ease: EASE }}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-(--ink)/15" />

          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="w-full max-w-80 overflow-hidden rounded-xl bg-white p-4 text-neutral-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/5">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={active}
                  initial={{
                    opacity: 0,
                    y: reduceMotion ? 0 : 8,
                    filter: "blur(4px)",
                  }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    y: reduceMotion ? 0 : -8,
                    filter: "blur(4px)",
                  }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="flex flex-col"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-neutral-500">
                      {feature.card.label}
                    </p>
                    <span
                      className={badgeVariants({
                        tone: feature.card.status.tone,
                      })}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          STATUS_DOT[feature.card.status.tone],
                        )}
                      />
                      {feature.card.status.text}
                    </span>
                  </div>
                  <p className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
                    {feature.card.value}
                  </p>
                  <div className="mt-5 h-[84px]">{feature.card.visual}</div>
                  <p className="mt-4 border-t border-black/5 pt-3 text-xs text-neutral-500">
                    {feature.card.meta}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Platform features"
          onKeyDown={onKeyDown}
          className="mt-8 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4"
        >
          {FEATURES.map((item, i) => {
            const selected = i === active;
            return (
              <button
                key={item.tab}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`${id}-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  "relative rounded-sm py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)",
                  selected
                    ? "text-(--paper)"
                    : "text-(--paper)/45 hover:text-(--paper)/75",
                )}
              >
                <span className="absolute inset-x-0 top-0 h-px bg-white/10" />
                {selected && (
                  <motion.span
                    layoutId={`${id}-indicator`}
                    transition={{
                      duration: reduceMotion ? 0 : 0.4,
                      ease: EASE,
                    }}
                    className="absolute inset-x-0 top-0 h-px bg-(--paper)"
                  />
                )}
                {item.tab}
              </button>
            );
          })}
        </div>

        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          className="mt-2 grid lg:grid-cols-4 lg:gap-x-6"
        >
          {FEATURES.map((item, i) => (
            <motion.p
              key={item.tab}
              aria-hidden={i !== active}
              initial={false}
              animate={{ opacity: i === active ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
              className={cn(
                "col-start-1 row-start-1 max-w-[52ch] text-base text-pretty text-(--paper)/65 lg:max-w-[40ch] lg:text-sm",
                PANEL_COLUMN[i],
                i !== active && "pointer-events-none select-none",
              )}
            >
              {item.description}
            </motion.p>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button
            href={`${APP_URL}/sign-up`}
            variant="secondary"
            scheme="dark"
            size="lg"
            rounded
          >
            Start a task
            <IconArrowRight data-icon="inline-end" aria-hidden />
          </Button>
          <a
            href="/docs"
            className="rounded-sm text-sm text-(--paper)/75 hover:text-(--paper) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)"
          >
            Read the docs
          </a>
        </div>
      </div>
    </Section>
  );
}

function Unit({ value, unit }: { value: string; unit: string }) {
  return (
    <>
      {value}
      <span className="ml-1 text-base text-neutral-400">{unit}</span>
    </>
  );
}

function useStagger() {
  const reduceMotion = useReducedMotion();
  return (i: number) => ({
    initial: { opacity: 0, x: reduceMotion ? 0 : -6 },
    animate: { opacity: 1, x: 0 },
    transition: {
      duration: 0.3,
      ease: EASE,
      delay: reduceMotion ? 0 : 0.15 + i * 0.12,
    },
  });
}

function SwitchSteps() {
  const stagger = useStagger();
  const steps = [
    { label: "Pick a new model", time: "0.4s" },
    { label: "History adapts", time: "0.9s" },
    { label: "Tools re-attach", time: "0.6s" },
    { label: "Answer continues", time: "0.1s" },
  ];
  return (
    <ul className="space-y-1.5">
      {steps.map((step, i) => (
        <motion.li
          key={step.label}
          {...stagger(i)}
          className="flex items-center gap-2 text-xs"
        >
          <span className="grid size-3.5 place-items-center rounded-full bg-emerald-500 text-white">
            <IconCheck className="size-2.5" stroke={3} />
          </span>
          <span className="text-neutral-700">{step.label}</span>
          <span className="ml-auto text-neutral-400 tabular-nums">
            {step.time}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function RunBars() {
  const reduceMotion = useReducedMotion();
  const bars = [3, 3, 4, 6, 9, 14, 22, 31, 40, 52, 58, 64];
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end gap-1">
        {bars.map((count, i) => (
          <motion.span
            key={i}
            initial={{ scaleY: reduceMotion ? 1 : 0 }}
            animate={{ scaleY: 1 }}
            transition={{
              duration: 0.5,
              ease: EASE,
              delay: reduceMotion ? 0 : 0.1 + i * 0.04,
            }}
            className={cn(
              "flex-1 origin-bottom rounded-[3px]",
              i === bars.length - 1
                ? "bg-neutral-900"
                : i > 6
                  ? "bg-neutral-300"
                  : "bg-neutral-200",
            )}
            style={{ height: `${(count / 64) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-neutral-400 tabular-nums">
        <span>Mon</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function FallbackRoutes() {
  const stagger = useStagger();
  const models = [
    { name: "Claude Sonnet 5.5", ms: 2400, failed: true },
    { name: "GPT 6.1 Sol", ms: 1200, tookOver: true },
    { name: "Gemini 3.8 Flash", ms: 2100 },
  ];
  return (
    <ul className="space-y-2">
      {models.map((model, i) => (
        <motion.li key={model.name} {...stagger(i)} className="text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  model.failed
                    ? "bg-red-400"
                    : model.tookOver
                      ? "bg-sky-500"
                      : "bg-neutral-300",
                )}
              />
              <span
                className={
                  model.tookOver
                    ? "font-medium text-neutral-900"
                    : "text-neutral-500 line-through decoration-red-300"
                }
              >
                {model.name}
              </span>
            </span>
            <span
              className={cn(
                "tabular-nums",
                model.tookOver ? "text-neutral-900" : "text-neutral-400",
              )}
            >
              {model.tookOver ? "took over" : "timed out"}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-neutral-100">
            <div
              className={cn(
                "h-full rounded-full",
                model.failed
                  ? "bg-red-300"
                  : model.tookOver
                    ? "bg-sky-500"
                    : "bg-neutral-300",
              )}
              style={{ width: `${(model.ms / 2400) * 100}%` }}
            />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

function QuotaSpend() {
  const reduceMotion = useReducedMotion();
  const stagger = useStagger();
  const rows = [
    {
      label: "Chat tokens",
      value: "2.9M",
      share: "of 4.5M",
      color: "bg-neutral-900",
    },
    {
      label: "Image generations",
      value: "18",
      share: "of 75",
      color: "bg-(--brand)",
    },
  ];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-neutral-100">
        <motion.div
          initial={{ width: reduceMotion ? "52%" : "0%" }}
          animate={{ width: "52%" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="h-full bg-neutral-900"
        />
        <motion.div
          initial={{ width: reduceMotion ? "12%" : "0%" }}
          animate={{ width: "12%" }}
          transition={{
            duration: 0.6,
            ease: EASE,
            delay: reduceMotion ? 0 : 0.35,
          }}
          className="h-full bg-(--brand)"
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((row, i) => (
          <motion.li
            key={row.label}
            {...stagger(i + 1)}
            className="flex items-center gap-2 text-xs"
          >
            <span className={cn("size-2 rounded-sm", row.color)} />
            <span className="text-neutral-700">{row.label}</span>
            <span className="text-neutral-400 tabular-nums">{row.value}</span>
            <span className="ml-auto text-neutral-900 tabular-nums">
              {row.share}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
