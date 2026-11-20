"use client";

import { Button, EASE, MONO, Section } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { APP_URL, MARKETING_URL } from "lib/site";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type Result = {
  title: string;
  aside: ReactNode;
  metrics: [string, string][];
  body: (props: { reduceMotion: boolean }) => ReactNode;
};

type Tab = {
  label: string;
  description: string;
  badge?: string;
  file: string;
  code: string;
  highlight: number[];
  result: Result;
};

const ADVANCE_SECONDS = 6;
const LINE_HEIGHT = 24;
const CODE_PAD = 16;

const TABS: Tab[] = [
  {
    label: "Connect MCP tools",
    description: "Paste one JSON block, get every tool.",
    file: "mcp.json",
    highlight: [1, 6],
    code: `{
  "github": {
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": { "Authorization": "Bearer YOUR_TOKEN" }
  },
  "notion": { "url": "https://mcp.notion.com/mcp" }
}`,
    result: {
      title: "Server connected",
      aside: <StatusDot on>6 tools found</StatusDot>,
      metrics: [
        ["Tools found", "6"],
        ["Set up in", "1 min"],
        ["Token shown to model", "Never"],
      ],
      body: () => <ToolBody />,
    },
  },
  {
    label: "Hand off a task",
    description: "Plain words in, finished work out.",
    file: "task.md",
    highlight: [0],
    code: `Read the open issues labeled "bug" in our GitHub repo.
Fix the top one in the sandbox and run the tests.
Then post a short summary to #eng in Slack.`,
    result: {
      title: "Cloud Agent",
      aside: <StatusDot on>Sandbox live</StatusDot>,
      metrics: [
        ["Steps", "12"],
        ["Tools", "3"],
        ["Preview", "Ready"],
      ],
      body: (props) => <StreamBody {...props} />,
    },
  },
  {
    label: "MCP server",
    description: "Void Agent's own read-only MCP server.",
    badge: "Open",
    file: "terminal",
    highlight: [0],
    code: `curl ${APP_URL}/api/mcp/server \\
  -H "Accept: application/json"`,
    result: {
      title: "Server tools",
      aside: <StatusDot on>Read-only</StatusDot>,
      metrics: [
        ["Transport", "Streamable HTTP"],
        ["Sign-in", "None"],
        ["Tools", "5"],
      ],
      body: () => <ToolsBody />,
    },
  },
  {
    label: "llms.txt",
    description: "Every public page, readable as Markdown.",
    file: "terminal",
    highlight: [0],
    code: `curl ${MARKETING_URL}/llms.txt`,
    result: {
      title: "llms.txt",
      aside: <span className="text-xs text-(--paper)/50">text/markdown</span>,
      metrics: [
        ["Format", "Markdown"],
        ["Pages", "Indexed"],
        ["For", "LLMs & crawlers"],
      ],
      body: (props) => <LlmsBody {...props} />,
    },
  },
  {
    label: "Sandbox",
    description: "A real Linux box with your toolchain.",
    file: "terminal",
    highlight: [0],
    code: `node -v && python3 --version && git --version`,
    result: {
      title: "Sandbox ready",
      aside: <StatusDot on>E2B Linux</StatusDot>,
      metrics: [
        ["Steps", "4/4"],
        ["Runtime", "Node.js, Python, git"],
        ["Preview", "Live"],
      ],
      body: (props) => <SandboxBody {...props} />,
    },
  },
];

const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(#.*$|\/\/.*$)|\b(import|from|const|await|new|def|return|for|in|curl)\b|\b(true|false|True|False|None|null|\d+(?:\.\d+)?)\b|(\B-[A-Za-z]\b)|\b([A-Za-z_]\w*)(?=\()|\b([A-Za-z_]\w*)(?==[^=]|:\s)/gm;

const TOKEN_COLORS = [
  "text-[#a5d6a7]",
  "text-(--paper)/35",
  "text-[#6fc1ff]",
  "text-[#c3a6ff]",
  "text-[#6fc1ff]",
  "text-[#f2c879]",
  "text-[#f5a97f]",
];

function highlight(line: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    const text = match[0];
    const group = match.slice(1).findIndex((value) => value !== undefined);
    parts.push(
      <span key={index} className={TOKEN_COLORS[group] ?? ""}>
        {text}
      </span>,
    );
    last = index + text.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

function blur(reduceMotion: boolean, amount: number) {
  return reduceMotion ? "blur(0px)" : `blur(${amount}px)`;
}

export function Developers() {
  const reduceMotion = !!useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [runs, setRuns] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);
  const tab = TABS[active];
  const autoplay = !reduceMotion && !paused && !manual && inView;

  const select = (index: number) => {
    setActive(index);
    setManual(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: (active + 1) % TABS.length,
      ArrowLeft: (active - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const reveal = (delay: number) => ({
    initial: {
      opacity: 0,
      filter: blur(reduceMotion, 8),
      y: reduceMotion ? 0 : 8,
    },
    whileInView: { opacity: 1, filter: "blur(0px)", y: 0 },
    viewport: { once: true, amount: 0.6 },
    transition: { duration: 0.6, ease: EASE, delay },
  });

  return (
    <Section
      id="developers"
      labelledBy={`${id}-heading`}
      className="py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <motion.h2
          {...reveal(0)}
          id={`${id}-heading`}
          className="max-w-[22ch] text-4xl tracking-tight text-balance sm:text-5xl"
        >
          Connect your stack <br className="max-sm:hidden" />
          with MCP.
        </motion.h2>
        <motion.p
          {...reveal(0.08)}
          className="mt-5 max-w-[56ch] text-base text-pretty text-(--paper)/60"
        >
          Plug GitHub, Notion, Slack or any MCP server into Void Agent, and let
          chat and Cloud Agent use them for you.
        </motion.p>
        <motion.div {...reveal(0.16)} className="mt-8 flex flex-wrap gap-3">
          <Button
            href="/docs"
            variant="secondary"
            scheme="dark"
            size="lg"
            rounded
          >
            Read the docs
            <IconArrowRight data-icon="inline-end" aria-hidden />
          </Button>
          <Button
            href="/docs/mcp"
            variant="outline"
            scheme="dark"
            size="lg"
            rounded
          >
            MCP guide
          </Button>
        </motion.div>

        <div
          role="tablist"
          aria-label="Developer features"
          onKeyDown={onKeyDown}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="-mx-6 mt-16 flex snap-x scroll-px-6 overflow-x-auto px-6 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0"
        >
          {TABS.map((item, i) => {
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
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                className="group relative w-56 shrink-0 snap-start py-5 pr-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper) md:w-auto"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-white/10" />
                {selected && (
                  <motion.span
                    key={`${active}-${autoplay}`}
                    className="absolute inset-x-0 top-0 h-px origin-left bg-(--brand)"
                    initial={{ scaleX: autoplay ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={
                      autoplay
                        ? { duration: ADVANCE_SECONDS, ease: "linear" }
                        : { duration: 0 }
                    }
                    onAnimationComplete={() => {
                      if (autoplay)
                        setActive((current) => (current + 1) % TABS.length);
                    }}
                  />
                )}
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors duration-150",
                      selected
                        ? "text-(--paper)"
                        : "text-(--paper)/55 group-hover:text-(--paper)/80",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="rounded-full bg-(--brand)/15 px-1.5 py-0.5 text-[11px] font-medium text-(--brand)">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block text-sm text-pretty transition-colors duration-150",
                    selected ? "text-(--paper)/65" : "text-(--paper)/40",
                  )}
                >
                  {item.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="mt-4 border-y border-white/[0.06] bg-white/[0.015] py-10 sm:py-14"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 lg:h-[460px] lg:grid-cols-[1.15fr_1fr]">
          <CodeCard
            tab={tab}
            motionKey={active}
            reduceMotion={reduceMotion}
            onRun={() => {
              setRuns((r) => r + 1);
              setManual(true);
            }}
          />
          <ResultPanel
            result={tab.result}
            motionKey={active}
            runKey={runs}
            reduceMotion={reduceMotion}
          />
        </div>
      </div>
    </Section>
  );
}

function Swap({
  motionKey,
  reduceMotion,
  delay = 0,
  className,
  children,
}: {
  motionKey: number;
  reduceMotion: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("grid", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={motionKey}
          className="col-start-1 row-start-1"
          initial={{
            opacity: 0,
            filter: blur(reduceMotion, 6),
            y: reduceMotion ? 0 : 6,
          }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          exit={{
            opacity: 0,
            filter: blur(reduceMotion, 6),
            y: reduceMotion ? 0 : -6,
          }}
          transition={{
            duration: reduceMotion ? 0.15 : 0.4,
            ease: EASE,
            delay,
          }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const LANGUAGES: Record<string, { name: string; tag: string }> = {
  py: { name: "Python 3.12", tag: "py" },
  ts: { name: "TypeScript", tag: "ts" },
  sh: { name: "Shell", tag: "sh" },
};

const languageFor = (file: string) =>
  file.endsWith(".py")
    ? LANGUAGES.py
    : file.endsWith(".ts")
      ? LANGUAGES.ts
      : LANGUAGES.sh;

const INNER_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]";

function CodeCard({
  tab,
  motionKey,
  reduceMotion,
  onRun,
}: {
  tab: Tab;
  motionKey: number;
  reduceMotion: boolean;
  onRun: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const lines = tab.code.split("\n");
  const language = languageFor(tab.file);
  const caretLine = tab.highlight[0];
  const caretCol = (lines[caretLine]?.length ?? 0) + 1;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex min-h-[340px] min-w-0 flex-col rounded-2xl bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 pr-1 pl-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "flex h-7 items-center gap-2 rounded-lg bg-[#0a0a0a] pr-3 pl-1.5",
              INNER_SHADOW,
            )}
          >
            <span
              className="grid h-4 min-w-5 place-items-center rounded bg-white/[0.08] px-1 text-[9px] font-semibold text-(--paper)/70 uppercase"
              style={MONO}
            >
              <Swap motionKey={motionKey} reduceMotion={reduceMotion}>
                {language.tag}
              </Swap>
            </span>
            <Swap
              motionKey={motionKey}
              reduceMotion={reduceMotion}
              className="text-xs text-(--paper)/85"
            >
              <span style={MONO}>{tab.file}</span>
            </Swap>
          </span>
          <span
            className="hidden h-7 items-center px-3 text-xs text-(--paper)/30 sm:flex"
            style={MONO}
            aria-hidden
          >
            .env
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy code"}
            onClick={() => {
              navigator.clipboard?.writeText(tab.code);
              setCopied(true);
            }}
            className="relative grid size-7 place-items-center rounded-md text-(--paper)/45 hover:bg-white/5 hover:text-(--paper) focus-visible:outline-2 focus-visible:outline-(--paper)"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={copied ? "check" : "copy"}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
              >
                {copied ? (
                  <IconCheck className="size-4 text-(--brand)" aria-hidden />
                ) : (
                  <IconCopy className="size-4" stroke={1.75} aria-hidden />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
          <Button
            variant="secondary"
            scheme="dark"
            size="sm"
            onClick={onRun}
            aria-label="Run this code and replay the response"
          >
            <IconPlayerPlayFilled data-icon="inline-start" className="size-3" />
            Run
          </Button>
        </div>
      </div>

      <pre
        className={cn(
          "relative mt-1 min-h-0 flex-1 overflow-auto rounded-xl bg-[#0a0a0a] text-[13px]/6",
          INNER_SHADOW,
        )}
        style={MONO}
      >
        <AnimatePresence initial={false}>
          {tab.highlight.map((line, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-x-0 h-6 bg-white/[0.035]"
              initial={{ opacity: 0, y: CODE_PAD + line * LINE_HEIGHT }}
              animate={{ opacity: 1, y: CODE_PAD + line * LINE_HEIGHT }}
              exit={{ opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      y: { type: "spring", stiffness: 260, damping: 30 },
                      opacity: { duration: 0.25 },
                    }
              }
            >
              <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-(--brand)" />
            </motion.span>
          ))}
        </AnimatePresence>

        <div className="grid py-4">
          <AnimatePresence initial={false}>
            <motion.code
              key={motionKey}
              className="relative col-start-1 row-start-1 block"
              exit={{
                opacity: 0,
                filter: blur(reduceMotion, 4),
                transition: { duration: 0.2 },
              }}
            >
              {lines.map((line, i) => {
                const marked = tab.highlight.includes(i);
                return (
                  <motion.span
                    key={i}
                    className="flex pr-4"
                    initial={{
                      opacity: 0,
                      x: reduceMotion ? 0 : -8,
                      filter: blur(reduceMotion, 4),
                    }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    transition={{
                      duration: reduceMotion ? 0.15 : 0.35,
                      ease: EASE,
                      delay: reduceMotion ? 0 : 0.12 + i * 0.025,
                    }}
                  >
                    <span
                      className={cn(
                        "w-11 shrink-0 pr-4 text-right select-none",
                        marked ? "text-(--paper)/55" : "text-(--paper)/15",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="whitespace-pre text-(--paper)/80">
                      {highlight(line)}
                      {i === caretLine && (
                        <motion.span
                          aria-hidden
                          className="ml-px inline-block h-4 w-0.5 translate-y-[3px] bg-(--paper)"
                          animate={
                            reduceMotion ? undefined : { opacity: [1, 1, 0, 0] }
                          }
                          transition={{
                            duration: 1.1,
                            times: [0, 0.5, 0.5, 1],
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                      )}
                    </span>
                  </motion.span>
                );
              })}
            </motion.code>
          </AnimatePresence>
        </div>
      </pre>

      <div
        className="flex h-8 shrink-0 items-center justify-between gap-3 px-2.5 pt-1 text-[11px] text-(--paper)/40"
        style={MONO}
      >
        <span className="flex items-center gap-3">
          <Swap motionKey={motionKey} reduceMotion={reduceMotion}>
            {language.name}
          </Swap>
          <span className="max-sm:hidden">UTF-8</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 max-sm:hidden">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            voidagent
          </span>
          <span className="tabular-nums">
            Ln {caretLine + 1}, Col {caretCol}
          </span>
        </span>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  motionKey,
  runKey,
  reduceMotion,
}: {
  result: Result;
  motionKey: number;
  runKey: number;
  reduceMotion: boolean;
}) {
  return (
    <div className="flex min-h-[360px] min-w-0 flex-col rounded-2xl bg-[#141414] p-1.5 text-(--paper) shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <Swap
            motionKey={motionKey}
            reduceMotion={reduceMotion}
            className="text-sm font-medium"
          >
            {result.title}
          </Swap>
          <Swap
            motionKey={motionKey}
            reduceMotion={reduceMotion}
            delay={0.05}
            className="justify-items-end"
          >
            {result.aside}
          </Swap>
        </div>
        <div className="grid min-h-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.div
              key={`${motionKey}-${runKey}`}
              className="col-start-1 row-start-1 min-h-0"
              initial={{
                opacity: 0,
                scale: reduceMotion ? 1 : 0.985,
                filter: blur(reduceMotion, 10),
              }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{
                opacity: 0,
                scale: reduceMotion ? 1 : 1.01,
                filter: blur(reduceMotion, 10),
              }}
              transition={{ duration: reduceMotion ? 0.15 : 0.45, ease: EASE }}
              style={{ transformOrigin: "50% 0%" }}
            >
              {result.body({ reduceMotion })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-4 px-4 pt-4 pb-3">
        {result.metrics.map(([label, value], i) => (
          <div key={i} className="min-w-0">
            <dt className="text-xs text-(--paper)/50">
              <Swap
                motionKey={motionKey}
                reduceMotion={reduceMotion}
                delay={0.08 + i * 0.05}
              >
                {label}
              </Swap>
            </dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
              <Swap
                motionKey={motionKey}
                reduceMotion={reduceMotion}
                delay={0.12 + i * 0.05}
              >
                <span className="block truncate">{value}</span>
              </Swap>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StatusDot({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-(--paper)/50">
      <span
        className={cn(
          "size-1.5 rounded-full",
          on ? "bg-(--brand)" : "bg-white/25",
        )}
      />
      {children}
    </span>
  );
}

const REPLY =
  "Fixed #482 — the login crash came from a stale session token. Tests pass in the sandbox, the preview link is live, and the summary is posted in #eng.";

function StreamBody({ reduceMotion }: { reduceMotion: boolean }) {
  const words = REPLY.split(" ");
  const [count, setCount] = useState(reduceMotion ? words.length : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= words.length) {
          clearInterval(timer);
          return c;
        }
        return c + 1;
      });
    }, 70);
    return () => clearInterval(timer);
  }, [reduceMotion, words.length]);

  const done = count >= words.length;

  return (
    <div className="p-4">
      <p className="w-fit rounded-xl bg-white/[0.06] px-3.5 py-2 text-sm text-(--paper)/70">
        Fix the top bug and run the tests
      </p>
      <p className="mt-4 text-[15px]/7 text-(--paper)/90">
        {words.slice(0, count).map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: "blur(3px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.3 }}
          >
            {word}{" "}
          </motion.span>
        ))}
        {!done && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-(--brand)" />
        )}
      </p>
    </div>
  );
}

function ToolBody() {
  return (
    <div className="p-4">
      <pre
        className="rounded-lg bg-black/30 p-4 text-[13px]/6 text-(--paper)/80 ring-1 ring-white/[0.08]"
        style={MONO}
      >
        {`{
  "name": "create_issue",
  "arguments": {
    "title": "Login crash on Safari",
    "labels": ["bug"]
  }
}`}
      </pre>
    </div>
  );
}

const SERVER_TOOLS = [
  ["voidagent_get_overview", "What Void Agent is and where to start"],
  ["voidagent_list_models", "The models available, by provider"],
  ["voidagent_list_capabilities", "Product capabilities, like Cloud Agent"],
  ["voidagent_list_pages", "Public pages that read as Markdown"],
  ["voidagent_get_page", "The Markdown source of one public page"],
];

function ToolsBody() {
  return (
    <div className="p-4">
      <ul className="space-y-2.5 text-sm">
        {SERVER_TOOLS.map(([tool, desc], i) => (
          <motion.li
            key={tool}
            className="flex items-center gap-2.5 text-(--paper)/80"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.15 + i * 0.09 }}
          >
            <motion.span
              className="grid size-4 shrink-0 place-items-center rounded-full bg-(--brand) text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 24,
                delay: 0.2 + i * 0.09,
              }}
            >
              <IconCheck className="size-2.5" stroke={3} aria-hidden />
            </motion.span>
            <span className="truncate" style={MONO}>
              {tool}
            </span>
            <span className="ml-auto hidden text-xs text-(--paper)/45 sm:block">
              {desc}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const LLMS_PAGES = [
  ["Home", "Autonomous AI agents, on any model."],
  ["Docs: MCP", "Connect GitHub, Notion, Slack or any MCP server."],
  ["Pricing", "Plans and transparent weekly quotas."],
  ["Index", "Releases, research and engineering dispatches."],
];

function LlmsBody({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="p-4">
      <p className="text-sm font-medium text-(--paper)/90"># Void-Agent</p>
      <ul className="mt-3 space-y-2.5 text-sm">
        {LLMS_PAGES.map(([page, desc], i) => (
          <motion.li
            key={page}
            className="flex items-center gap-2.5 text-(--paper)/80"
            initial={{ opacity: 0, x: reduceMotion ? 0 : -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.35,
              ease: EASE,
              delay: reduceMotion ? 0 : 0.15 + i * 0.1,
            }}
          >
            <span className="text-(--paper)/40">-</span>
            <span className="font-medium text-(--brand)">{page}</span>
            <span className="truncate text-xs text-(--paper)/50">{desc}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const SANDBOX_STEPS = [
  { id: "pnpm install", time: "12s", progress: 100 },
  { id: "next dev", time: "2s", progress: 100 },
  { id: "run the tests", time: "8s", progress: 100 },
  { id: "preview url issued", time: "live", progress: 100 },
];

function SandboxBody({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="px-4">
      <div className="grid grid-cols-[1fr_auto_1.2fr_auto] items-center gap-x-4 border-b border-white/[0.06] py-2.5 text-xs text-(--paper)/45">
        <span>Step</span>
        <span>Time</span>
        <span>Progress</span>
        <span className="w-14 text-right">Status</span>
      </div>
      {SANDBOX_STEPS.map((step, i) => (
        <motion.div
          key={step.id}
          className="grid grid-cols-[1fr_auto_1.2fr_auto] items-center gap-x-4 border-b border-white/[0.05] py-3.5 text-sm last:border-0"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            ease: EASE,
            delay: reduceMotion ? 0 : 0.15 + i * 0.07,
          }}
        >
          <span className="text-xs text-(--paper)/80" style={MONO}>
            {step.id}
          </span>
          <span className="text-(--paper)/65 tabular-nums">{step.time}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <motion.span
              className="block h-full origin-left rounded-full bg-(--brand)"
              style={{ width: `${step.progress}%` }}
              initial={{ scaleX: reduceMotion ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: 0.8,
                ease: EASE,
                delay: reduceMotion ? 0 : 0.3 + i * 0.08,
              }}
            />
          </span>
          <span className="w-14 text-right text-xs text-(--paper)/50">
            {step.progress === 100 ? "Done" : `${step.progress}%`}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
