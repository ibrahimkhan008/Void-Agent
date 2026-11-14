import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { DitherCanvas } from "@/components/ui/dither-canvas";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

export const metadata: Metadata = {
  title: "Brand Kit | Void Agent",
  description:
    "The Void-Agent brand kit: the mark, word mark, colors, typography, the dither treatment, and usage rules.",
  alternates: { canonical: "/branding" },
};

const COLORS = [
  {
    name: "Blue",
    hex: "#2537D5",
    role: "Actions, accents, links, the mark's color",
    bg: "#2537D5",
    text: "#FFFFFF",
  },
  {
    name: "Light Blue",
    hex: "#7E89E6",
    role: "Active markers, the button glow, gradient mid-tones",
    bg: "#7E89E6",
    text: "#000000",
  },
  {
    name: "Ink",
    hex: "#000000",
    role: "Type and marks",
    bg: "#000000",
    text: "#FFFFFF",
  },
  {
    name: "Ground",
    hex: "#FFFFFF",
    role: "The page",
    bg: "#FFFFFF",
    text: "#000000",
  },
  {
    name: "Surface",
    hex: "#F4F5F8",
    role: "Trays and raised panels",
    bg: "#F4F5F8",
    text: "#000000",
  },
  {
    name: "Gray",
    hex: "#C7C7C4",
    role: "Working neutral, rules, quiet fills",
    bg: "#C7C7C4",
    text: "#000000",
  },
];

const ASSETS = [
  { label: "Mark (WebP, 512 px)", href: "/logo-va-512.webp" },
  { label: "App icon (WebP, 192 px)", href: "/logo-va-192.webp" },
  { label: "Mark, small (WebP, 128 px)", href: "/images/logo-va-128.webp" },
  { label: "Design guide (Markdown)", href: "/design.md" },
];

const RULES = [
  [
    "Never redraw, trace, or approximate the mark",
    "The mark sits on a fixed construction grid. Use the supplied files.",
  ],
  [
    "Place it only on the three brand grounds",
    "Ground #FFFFFF, Ink #000000, or Blue #2537D5. Nothing else.",
  ],
  [
    "Partners are technology partners, never customers",
    "Partner marks are never recolored or redrawn.",
  ],
  [
    "One accent word per headline",
    "Instrument Serif italic, ink-to-blue fade through the halftone mask. Never set body text in the accent face.",
  ],
  [
    "The blue always comes from below",
    "Gradients fall like light: white at the top, Light Blue in the middle, Blue at the base. Never blend hues side to side.",
  ],
  [
    "Show units and real numbers",
    "Prices and limits come from the product. Format large numbers as 2.5M or 400K. Never invent metrics.",
  ],
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
      {children}
    </h2>
  );
}

export default function BrandingPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-40 pb-16 text-center sm:pt-48">
        <Eyebrow>Brand kit</Eyebrow>
        <h1 className="mt-6 text-5xl leading-[1.03] font-normal tracking-[-0.04em] text-balance text-(--paper) sm:text-6xl lg:text-7xl">
          The Void Agent <AccentSpan>Brand Kit</AccentSpan>
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-lg/8 text-pretty text-(--paper)/60">
          The mark, the word mark, the palette, the type families, and the rules
          that keep them consistent — everything you need to design with Void
          Agent.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {ASSETS.map((asset) => (
            <a
              key={asset.href}
              href={asset.href}
              download
              className="bs-btn h-10 rounded-lg px-4 text-sm"
            >
              <Download className="size-4" />
              {asset.label}
            </a>
          ))}
        </div>
      </section>

      {/* Logo */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Eyebrow>Logo</Eyebrow>
        <SectionHeading>
          The Mark And The <AccentSpan>Word Mark</AccentSpan>
        </SectionHeading>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {/* Ground */}
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="grid h-64 place-items-center rounded-[14px] bg-[#FFFFFF]">
              <span className="relative block size-28">
                <DitherCanvas
                  src="/images/logo-va-128.webp"
                  width={128}
                  height={128}
                  className="size-28 rounded-xl"
                />
              </span>
            </div>
            <p className="px-4 py-3 text-sm text-(--paper)/60">
              Mark on Ground — #FFFFFF
            </p>
          </div>
          {/* Ink */}
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="grid h-64 place-items-center rounded-[14px] bg-[#000000]">
              <span className="relative block size-28">
                <DitherCanvas
                  src="/images/logo-va-128.webp"
                  width={128}
                  height={128}
                  className="size-28 rounded-xl"
                />
              </span>
            </div>
            <p className="px-4 py-3 text-sm text-(--paper)/60">
              Mark on Ink — #000000
            </p>
          </div>
          {/* Green */}
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="grid h-64 place-items-center rounded-[14px] bg-[#2537D5]">
              <span className="relative block size-28">
                <DitherCanvas
                  src="/images/logo-va-128.webp"
                  width={128}
                  height={128}
                  className="size-28 rounded-xl brightness-0 invert"
                />
              </span>
            </div>
            <p className="px-4 py-3 text-sm text-(--paper)/60">
              Mark on Blue — #2537D5
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-[70ch] text-sm/6 text-(--paper)/60">
          The mark is the "VA" monogram with an orbital swoosh. Place it only on
          the three brand grounds. Never redraw, rotate, outline, recolor, or
          re-space it. Lockups pair the mark with the word mark in Geist Medium
          at -2% tracking, optically centered, in one flat color.
        </p>
      </section>

      {/* Colors */}
      <section className="bg-(--ink-2) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Color</Eyebrow>
          <SectionHeading>
            Cool White With One <AccentSpan>Living Color</AccentSpan>
          </SectionHeading>
          <p className="mt-5 max-w-[70ch] text-lg/8 text-(--paper)/60">
            Three primaries carry the system: Blue, Ink, and the white ground.
            Gray is the neutral in between; Light Blue tints markers, glows, and
            gradient mid-tones. Blue stays readable at every size (8.1:1 on
            white); reserve Light Blue for graphic accents.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COLORS.map((color) => (
              <div
                key={color.hex}
                className="rounded-[20px] bg-(--ink) p-1.5 shadow-[var(--bs-shadow-tray)]"
              >
                <div className="rounded-[14px] bg-white p-4">
                  <div
                    className="h-24 rounded-xl border border-black/[0.08]"
                    style={{ background: color.bg }}
                  />
                  <p className="mt-3 text-sm font-medium text-(--paper)">
                    {color.name}
                  </p>
                  <p className="font-mono text-xs text-(--paper)/55">
                    {color.hex}
                  </p>
                  <p className="mt-1 text-xs/5 text-(--paper)/55">
                    {color.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Typography */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Typography</Eyebrow>
          <SectionHeading>
            Quiet, Precise, <AccentSpan>Physical</AccentSpan>
          </SectionHeading>
          <div className="mt-12 space-y-4">
            <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="rounded-[14px] bg-white p-6">
                <p className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  Geist — headlines, UI, body
                </p>
                <p className="mt-3 text-4xl font-normal tracking-[-0.03em] text-(--paper)">
                  Hand It The Work. Check Back Later.
                </p>
                <p className="mt-3 text-base/7 text-(--paper)/65">
                  Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu
                  Vv Ww Xx Yy Zz 0123456789
                </p>
              </div>
            </div>
            <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="rounded-[14px] bg-white p-6">
                <p className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  Geist Mono — eyebrows, labels, numbers, code
                </p>
                <p className="mt-3 font-mono text-sm text-(--paper)">
                  ✳ ONE PLATFORM · 2.5M AI TOKENS A WEEK · 400K · 10 GB
                </p>
              </div>
            </div>
            <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
              <div className="rounded-[14px] bg-white p-6">
                <p className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
                  Instrument Serif italic — accent words only
                </p>
                <p className="mt-3 text-4xl font-normal tracking-[-0.03em] text-(--paper)">
                  Built For The Way You <AccentSpan>Ship.</AccentSpan>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Usage rules */}
      <section className="bg-(--ink-2) py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <Eyebrow>Usage</Eyebrow>
          <SectionHeading>
            The Rules That Keep It <AccentSpan>Consistent</AccentSpan>
          </SectionHeading>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {RULES.map(([title, body]) => (
              <div
                key={title}
                className="rounded-[14px] bg-white p-6 shadow-[var(--bs-shadow-card)]"
              >
                <h3 className="text-base font-medium text-(--paper)">
                  {title}
                </h3>
                <p className="mt-2 text-sm/6 text-(--paper)/60">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Eyebrow>Design like Void Agent</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            The Written Design <AccentSpan>System</AccentSpan>
          </h2>
          <p className="mx-auto mt-5 max-w-[60ch] text-lg/8 text-pretty text-(--paper)/60">
            The complete design guide — tokens, type, dither, motion, and the
            rules — is published as Markdown for AI tools and humans.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/design.md"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#fbfbfa]"
            >
              Read design.md
            </Link>
            <Link
              href="/contact"
              className="bs-btn h-11 rounded-lg px-5 text-[15px] [--surface-base:#e6e6e3]"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
