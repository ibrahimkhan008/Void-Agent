import Image from "next/image";
import Link from "next/link";
import { DitherCanvas } from "@/components/ui/dither-canvas";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

/* ─── 1. Hero ─────────────────────────────────────────────────────────────── */

export function LandingHero() {
  return (
    <section className="relative min-h-svh bg-(--ink) text-(--paper)">
      {/* Dithered backdrop, radially masked, fading to the bottom */}
      <div
        aria-hidden
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_44%_34%_at_27%_70%,black,transparent_85%)]"
      >
        <DitherCanvas
          src="/images/dither-footer.png"
          topFade
          className="h-full w-full object-cover object-top [image-rendering:pixelated]"
        />
      </div>
      {/* Green glow square masked by the site texture, rising at 0.5s */}
      <div
        aria-hidden
        className="landing-rise absolute top-[44%] right-[-6vw] h-[clamp(380px,40vw,760px)] w-[clamp(380px,40vw,760px)] bg-(--brand-glow)/55 [--rise-delay:0.5s] [--rise:24px]"
        style={{
          maskImage: "url(/bg.png)",
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskImage: "url(/bg.png)",
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
        }}
      />

      <div className="relative mx-auto flex min-h-svh max-w-7xl items-end px-5 pt-40 pb-14 lg:pb-[9vh]">
        <div className="max-w-[860px] lg:max-w-[min(880px,62%)]">
          <div className="landing-rise inline-flex items-center gap-2 [--rise-delay:0.05s]">
            <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-(--paper)">
              New
            </span>
            <span className="inline-flex items-center rounded-full bg-(--paper) px-3 py-1 text-[11px] font-medium tracking-[0.02em] text-white">
              Schedules: prompts that run on their own
            </span>
          </div>
          <h1 className="landing-rise mt-6 text-[44px] leading-[1.04] font-normal tracking-[-0.035em] text-balance sm:text-6xl lg:text-[88px] lg:leading-[1.02] [--rise-delay:0.12s] [--rise:60px] [--rise-duration:0.85s]">
            Autonomous AI agents, on <AccentSpan>any model</AccentSpan>
          </h1>
          <p className="landing-rise mt-6 max-w-[560px] text-lg/8 text-(--paper)/60 sm:text-xl/8 [--rise-delay:0.24s]">
            Build and ship full-stack apps in the cloud with Claude, GPT,
            Gemini, Groq and more — one workspace, any model.
          </p>
          <div className="landing-rise mt-8 flex flex-wrap items-center gap-3 [--rise-delay:0.36s]">
            <Link
              href="/sign-up"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
            >
              Start Building Free
            </Link>
            <Link
              href="/about"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
            >
              Learn more about Void Agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 2. Partner logo strip ───────────────────────────────────────────────── */

const PARTNERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "Groq",
  "Z AI",
  "Cloudvoid-agent",
];

export function PartnerStrip() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 text-center">
      <p className="text-[11px] font-medium tracking-[0.14em] text-(--paper)/55 uppercase">
        Built with our technology partners
      </p>
      <div className="mt-8 grid grid-cols-3 gap-x-8 gap-y-6 sm:grid-cols-6">
        {PARTNERS.map((partner, i) => (
          <div
            key={partner}
            className="landing-rise flex h-9 items-center justify-center opacity-80 transition-opacity duration-150 hover:opacity-100"
            style={
              { "--rise-delay": `${0.7 + i * 0.07}s` } as React.CSSProperties
            }
          >
            <span className="text-lg font-semibold tracking-tight text-(--paper)/70">
              {partner}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 3. #features — four tray cards with CSS visuals ────────────────────── */

const MODEL_ROWS = [
  { label: "OpenAI models", color: "#10a37f", active: true },
  { label: "Anthropic models", color: "#d97757" },
  { label: "Google models", color: "#1c69e0", tint: "#f0f5ff" },
  { label: "Groq models", color: "#f55036" },
  { label: "Local models", color: "#7c5cff" },
];

const TOOL_ROWS = [
  { name: "@web-search", desc: "Search the web" },
  { name: "@code", desc: "Run JS / Python" },
  { name: "@image", desc: "Generate & edit" },
  { name: "@files", desc: "Read PDFs, docs" },
  { name: "@playwright", desc: "MCP · Browser" },
];

function CardVisualModels() {
  return (
    <div className="rounded-[14px] bg-white p-4">
      <div className="flex items-center justify-between rounded-lg bg-(--ink-2) px-3 py-2">
        <span className="text-xs font-medium text-(--paper)">Model</span>
        <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-(--paper)/70">
          5
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {MODEL_ROWS.map((row) => (
          <li
            key={row.label}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: row.tint ?? "transparent" }}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: row.color }}
            />
            <span
              className={
                row.active ? "font-medium text-(--paper)" : "text-(--paper)/60"
              }
            >
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardVisualTools() {
  return (
    <div className="rounded-[14px] bg-white p-4">
      <p className="text-xs font-medium text-(--paper)/70">@ Tools</p>
      <ul className="mt-2 space-y-1">
        {TOOL_ROWS.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-(--ink-2)"
          >
            <span className="text-xs font-medium text-(--brand)">
              {row.name}
            </span>
            <span className="text-[11px] text-(--paper)/50">{row.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardVisualCanvas() {
  return (
    <div
      className="h-[200px] rounded-[14px] bg-white"
      style={{
        backgroundImage:
          "radial-gradient(circle, #d6d6d1 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    />
  );
}

function CardVisualVoice() {
  return (
    <div className="flex h-[200px] flex-col justify-center gap-3 rounded-[14px] bg-white p-4">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-(--paper)">
        <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
        Live
        <span className="flex items-end gap-0.5">
          {[3, 5, 2, 4].map((h, i) => (
            <span
              key={i}
              className="w-0.5 bg-(--brand-glow)"
              style={{ height: h * 2 }}
            />
          ))}
        </span>
      </span>
      <div className="rounded-xl bg-(--ink-2) px-3 py-2.5 text-xs/5 text-(--paper)/75">
        Compared 3 flight options to Tokyo for Friday morning.
      </div>
      <p className="font-mono text-[10px] text-(--paper)/50">
        @tool(&apos;web-search&apos;) · 240ms
      </p>
    </div>
  );
}

const FEATURE_CARDS = [
  {
    kicker: "Multi-LLM connector",
    title: "Configured Models, One Interface",
    body: "Use the providers and models enabled for your account through one consistent chat interface.",
    bullets: [
      "Model switching between tasks",
      "Tier-based model access",
      "Provider fallback where configured",
      "Admin-managed availability",
    ],
    visual: <CardVisualModels />,
  },
  {
    kicker: "Agent tooling",
    title: "Tools & MCP",
    body: "Extend agents with built-in tools and MCP servers that have been explicitly connected and approved.",
    bullets: [
      "Web search, code, image, files",
      "Connected MCP server tools",
      "Per-request tool allowlists",
      "Admin feature controls",
    ],
    visual: <CardVisualTools />,
  },
  {
    kicker: "Workflow builder",
    title: "Visual Workflows",
    body: "Compose reusable AI workflows on a visual canvas using the nodes available in Void Agent.",
    bullets: [
      "Drag-and-drop canvas",
      "LLM, HTTP, and tool nodes",
      "Saved reusable workflows",
      "Inspectable workflow runs",
    ],
    visual: <CardVisualCanvas />,
  },
  {
    kicker: "Conversational layer",
    title: "Realtime Voice & Chat",
    body: "Move between streaming text chat and the voice modes available in your configured Void Agent deployment.",
    bullets: [
      "Speech input and playback",
      "Streaming chat responses",
      "Saved conversation threads",
      "Responsive web interface",
    ],
    visual: <CardVisualVoice />,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <Eyebrow>One platform</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Built For The Way You <AccentSpan>Ship.</AccentSpan>
          </h2>
          <p className="mt-5 max-w-[60ch] text-lg/8 text-(--paper)/60">
            Void Agent brings configured models, approved tools, and reusable
            workflows into one platform for chat, creation, automation, and
            cloud coding tasks.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)] transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="rounded-[14px] bg-white p-1.5">
                {card.visual}
                <div className="p-4 pt-4">
                  <p className="font-mono text-[10px] tracking-[0.12em] text-(--paper)/50 uppercase">
                    {card.kicker}
                  </p>
                  <h3 className="mt-2 text-xl font-medium tracking-tight text-(--paper)">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm/6 text-(--paper)/60">
                    {card.body}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {card.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-center gap-2 text-sm text-(--paper)/70"
                      >
                        <span className="size-1 rounded-full bg-(--brand)" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/sign-up"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-white text-sm font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:bg-(--ink-2)"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 10. #get-started — final CTA card-in-card ───────────────────────────── */

export function GetStartedSection() {
  return (
    <section id="get-started" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
          <div className="relative min-h-[440px] overflow-hidden rounded-[14px] bg-white p-6 sm:p-10 sm:min-h-[480px]">
            <div aria-hidden className="absolute inset-0 -z-10 opacity-90">
              <DitherCanvas
                src="/images/dither-footer.png"
                className="h-full w-full object-cover [image-rendering:pixelated]"
              />
            </div>
            <div className="flex min-h-[400px] flex-col justify-between sm:min-h-[440px]">
              <Link href="/" className="flex w-fit items-center gap-2.5">
                <span className="relative block size-10">
                  <Image
                    src="/logo-va-512.webp"
                    alt="Void Agent"
                    width={40}
                    height={40}
                    className="object-contain"
                  />
                </span>
                <span className="text-xl font-semibold tracking-tight text-(--paper)">
                  Void Agent
                </span>
              </Link>
              <div className="mt-24 md:flex-row md:items-end md:justify-between">
                <h2 className="max-w-[22ch] text-5xl leading-[1.05] font-normal tracking-[-0.03em] text-(--paper) sm:text-[60px]">
                  Ready To Hand Off Your <AccentSpan>First Task?</AccentSpan>
                </h2>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/sign-up"
                    className="bs-btn h-11 rounded-full px-5 text-[15px] [--surface-base:#fbfbfa]"
                  >
                    Start building free
                  </Link>
                  <Link
                    href="/docs"
                    className="bs-btn h-11 rounded-full px-5 text-[15px] [--surface-base:#e6e6e3]"
                  >
                    Read the docs
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
