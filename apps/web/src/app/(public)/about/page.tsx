import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { DitherCanvas } from "@/components/ui/dither-canvas";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

export const metadata: Metadata = {
  title: "About Void-Agent: AI Research and Product Company",
  description:
    "Learn about our mission, our approach, and what we build across the Void-Agent workspace, Cloud Agent, and research.",
  alternates: { canonical: "/about" },
};

const PARTNERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "Groq",
  "Z AI",
  "Cloudflare",
];

const BUILD_CARDS = [
  {
    kicker: "Product",
    title: "Void-Agent workspace",
    body: "One place for chat, files, images, research and workflows. Pick from 30+ models by 12 AI labs and switch whenever you like, in the same thread.",
  },
  {
    kicker: "Agents",
    title: "Cloud Agent",
    body: "An agent with its own Linux computer. It plans the task, writes the code, runs it, fixes what breaks, and sends you a live link when it is done.",
  },
  {
    kicker: "Research",
    title: "Labs",
    body: "Our research team. New agent designs and models get tested here first, and only the ones that hold up make it into Void-Agent.",
  },
];

const PRINCIPLES = [
  {
    n: "01",
    title: "Build for everyone",
    body: "Students, solo founders and large teams should get the same good tools. That is why there is a real free plan, not a seven-day trial.",
  },
  {
    n: "02",
    title: "Research first",
    body: "We try things before we promise them. Ideas start as experiments in our labs and only reach you once they actually work.",
  },
  {
    n: "03",
    title: "Ship every week",
    body: "AI moves fast, so we do too. Small improvements land every week instead of one big launch every quarter.",
  },
  {
    n: "04",
    title: "Keep it simple",
    body: "Powerful should not mean complicated. If a feature needs a manual to use, we are not finished with it yet.",
  },
];

export default function AboutPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* 1. Hero */}
      <section className="relative pt-40 pb-20 sm:pt-48">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-[620px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_58%,black,transparent_85%)]"
        >
          <DitherCanvas
            src="/images/dither-footer.png"
            className="h-full w-full object-cover [image-rendering:pixelated]"
          />
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <Eyebrow>About Void-Agent</Eyebrow>
          <h1 className="mt-6 max-w-[20ch] text-[44px] leading-[1.05] font-normal tracking-[-0.035em] text-balance text-(--paper) sm:text-6xl lg:text-[72px]">
            We Build The Place Where AI <AccentSpan>Gets Work Done.</AccentSpan>
          </h1>
          <p className="mt-7 max-w-[54ch] text-lg/[1.6] text-(--paper)/60">
            Void-Agent started with a small annoyance. We had five AI tabs open,
            three subscriptions, and still spent the day copying text between
            them. So we built one workspace where any model can pick up a task
            and actually finish it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
            >
              Start free
              <ArrowRight className="size-4" data-icon="end" />
            </Link>
            <Link
              href="/pricing"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
            >
              See pricing
            </Link>
          </div>
        </div>

        {/* 2. Partner strip */}
        <div className="mx-auto mt-24 max-w-6xl px-6 text-center">
          <p className="text-[11px] font-medium tracking-[0.14em] text-(--paper)/55 uppercase">
            Built with our technology partners
          </p>
          <div className="mt-8 grid grid-cols-3 gap-x-8 gap-y-6 sm:grid-cols-6">
            {PARTNERS.map((partner) => (
              <div
                key={partner}
                className="flex h-9 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
              >
                <span className="text-lg font-semibold tracking-tight text-(--paper)/70">
                  {partner}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Our story */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="size-28 sm:size-36">
            <DitherCanvas
              src="/images/dither-plan-3.png"
              className="h-full w-full rounded-2xl object-cover [image-rendering:pixelated]"
            />
          </div>
          <div className="mt-8">
            <Eyebrow>Our story</Eyebrow>
            <h2 className="mt-5 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
              Built In India, <AccentSpan>For Everyone.</AccentSpan>
            </h2>
          </div>
          <div className="mt-8 max-w-[70ch] space-y-6 text-[17px]/8 text-(--paper)/65">
            <p>
              We founded Void-Agent in 2024 in India. We did not want to build
              another chatbot. We wanted to stop treating AI like something you
              ask questions and start treating it like a teammate you hand work
              to.
            </p>
            <p>
              That is why Cloud Agent exists. You describe the task, it gets its
              own computer, and it keeps working after you close the tab. When
              you come back, the app is built, the report is written, or the
              spreadsheet is cleaned up.
            </p>
            <p>
              We also refuse to bet on a single model. Claude writes
              beautifully, GPT reasons well, Gemini is quick, and DeepSeek is
              great with code and math. Void-Agent lets you use the right one
              for each step, in the same conversation.
            </p>
          </div>

          <figure className="mt-14">
            <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="aspect-[16/7] overflow-hidden rounded-[14px] bg-white sm:aspect-[16/6]">
                <DitherCanvas
                  src="/images/dither-footer.png"
                  className="h-full w-full object-cover [image-rendering:pixelated]"
                />
              </div>
            </div>
            <figcaption className="mt-3 flex items-center justify-between font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
              <span>Built in India</span>
              <span>Since 2024</span>
            </figcaption>
          </figure>

          <dl className="mt-16 grid grid-cols-2 gap-y-10 sm:grid-cols-4">
            {[
              ["Models", "30+"],
              ["AI labs", "12"],
              ["Founded", "2024"],
              ["Built in", "India"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  {k}
                </dt>
                <dd className="mt-2 text-4xl tracking-[-0.03em] text-(--paper)">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 4. What we build */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>What we build</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Three Things, <AccentSpan>One Goal.</AccentSpan>
          </h2>
          <p className="mt-5 max-w-[60ch] text-lg/8 text-(--paper)/60">
            Everything we make is about one idea: you should be able to hand
            work to AI and trust that it gets done.
          </p>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {BUILD_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white">
                  <div className="h-44 overflow-hidden rounded-t-[14px]">
                    <DitherCanvas
                      src="/images/dither-plan-2.png"
                      className="h-full w-full object-cover [image-rendering:pixelated]"
                    />
                  </div>
                  <div className="p-5">
                    <p className="font-mono text-[10px] tracking-[0.12em] text-(--paper)/50 uppercase">
                      {card.kicker}
                    </p>
                    <h3 className="mt-2 text-lg font-medium text-(--paper)">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm/6 text-(--paper)/60">
                      {card.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Principles */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6">
          <Eyebrow>Principles</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            How We <AccentSpan>Work.</AccentSpan>
          </h2>
          <div className="mt-14 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="grid rounded-[14px] bg-white sm:grid-cols-2">
              {PRINCIPLES.map((p) => (
                <div
                  key={p.n}
                  className="border-b border-r border-black/[0.06] p-6 text-center last:border-r-0 sm:[&:nth-child(2)]:border-r-0 sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 sm:[&:nth-child(4)]:border-r-0"
                >
                  <p className="font-mono text-[11px] text-(--brand)">{p.n}</p>
                  <h3 className="mt-3 text-lg font-medium text-(--paper)">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm/6 text-(--paper)/60">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Closing CTA */}
      <section className="pt-8 pb-24 sm:pb-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="relative overflow-hidden rounded-[14px] bg-white px-6 py-20 sm:py-28">
              <div aria-hidden className="absolute inset-0 -z-10">
                <DitherCanvas
                  src="/images/dither-footer.png"
                  className="h-full w-full object-cover object-[50%_70%] [image-rendering:pixelated]"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.4) 100%)",
                  }}
                />
              </div>
              <div className="text-center">
                <Eyebrow>Looking ahead</Eyebrow>
                <h2 className="mx-auto mt-5 max-w-[18ch] text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
                  The Future Won&apos;t Be Built By{" "}
                  <AccentSpan>A Single Model.</AccentSpan>
                </h2>
                <p className="mx-auto mt-5 max-w-[52ch] text-lg/8 text-(--paper)/60">
                  It will be built by people with good tools. We are just
                  getting started, and we would love for you to build with us.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/sign-up"
                    className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
                  >
                    Start free
                  </Link>
                  <Link
                    href="/contact"
                    className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
                  >
                    Talk to us
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
