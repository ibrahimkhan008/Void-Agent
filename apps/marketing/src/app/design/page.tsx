import { ChatComposer } from "@/components/chat-composer";
import { AccentSpan } from "@/components/ui/accent-span";
import { BrandButton } from "@/components/ui/brand-button";
import { DitherCanvas } from "@/components/ui/dither-canvas";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

// Demo source art for the dither canvas: an inline SVG (same-origin-safe
// for canvas reads). Product art can replace it later.
const DEMO_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='1' stop-color='#3c3c3c'/></linearGradient></defs><rect width='480' height='320' fill='url(#g)'/><circle cx='360' cy='90' r='70' fill='#0b0b0b'/><rect x='40' y='180' width='150' height='110' fill='#7a7a7a'/></svg>`,
  );

export const metadata = {
  title: "Design system",
};

// Authenticated design-system reference page (design-system extension mod).
// Showcases the display-surface components: BrandButton variants with the
// glow sweep, Eyebrow, AccentSpan, Reveal choreography and the dither
// image + canvas pattern.
export default function DesignSystemPage() {
  return (
    <div className="brand-surface min-h-dvh">
      <main className="mx-auto w-full max-w-6xl px-6 py-16 space-y-20">
        <header className="space-y-4">
          <Eyebrow>Design system · extension mod</Eyebrow>
          <h1 className="text-[44px] leading-[1.04] font-normal tracking-[-0.035em] text-balance sm:text-[60px]">
            The display surface,
            <br />
            <AccentSpan>one token at a time.</AccentSpan>
          </h1>
          <p className="text-lg/[1.55] text-(--bs-paper)/60 max-w-[560px]">
            Reference page for the design-system extension: display buttons with
            the glow sweep, eyebrow + accent typography, tray + card layering,
            reveal choreography and the dither image + canvas pattern.
          </p>
        </header>

        <section className="space-y-6">
          <Eyebrow>Tokens</Eyebrow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["--bs-ink", "#ffffff"],
              ["--bs-ink-2", "#f4f4f5"],
              ["--bs-paper", "#000000"],
              ["--bs-brand", "#18181b"],
              ["--bs-brand-glow", "#a1a1aa"],
            ].map(([name, hex]) => (
              <div key={name} className="bs-card p-4">
                <div
                  className="h-12 rounded-lg border border-black/[0.06]"
                  style={{ background: hex }}
                />
                <p className="mt-3 font-mono text-[11px] text-(--bs-paper)/60">
                  {name}
                </p>
                <p className="font-mono text-[11px] text-(--bs-paper)/85">
                  {hex}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>Typography</Eyebrow>
          <div className="bs-card p-8 space-y-5">
            <h2 className="text-4xl font-normal tracking-[-0.03em] text-balance sm:text-5xl max-w-[22ch]">
              Heading 400-weight, hierarchy by{" "}
              <AccentSpan>size and tracking.</AccentSpan>
            </h2>
            <p className="text-lg/[1.55] text-(--bs-paper)/60 max-w-[560px]">
              Body lede at 1.55 line-height, 60% ink. Prices and table figures
              use <span className="tabular-nums">tabular-nums</span>.
            </p>
            <Eyebrow>Monospace eyebrow micro-label</Eyebrow>
            <p className="font-mono text-[13px]/6 text-(--bs-paper)/85">
              mono: self-hosted Geist Mono — the original never shipped it.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>
            BrandButton — 3 variants, glow sweep, press feedback
          </Eyebrow>
          <div className="bs-tray p-4 space-y-4">
            <div className="bs-card p-6 flex flex-wrap items-center gap-3">
              <BrandButton variant="default">Default primary</BrandButton>
              <BrandButton variant="outline">Outline</BrandButton>
              <BrandButton variant="secondary">Secondary</BrandButton>
            </div>
            <div className="bs-card p-6 flex flex-wrap items-center gap-3">
              <BrandButton size="xs">xs · h-7</BrandButton>
              <BrandButton size="sm">sm · h-8</BrandButton>
              <BrandButton size="md">md · h-9</BrandButton>
              <BrandButton size="lg">lg · h-10</BrandButton>
              <BrandButton size="xl">xl · h-11</BrandButton>
            </div>
            <div className="bs-card p-6">
              <p className="text-xs text-(--bs-paper)/50 font-mono mb-3">
                hero-size override: --surface-base #fbfbfa / #e6e6e3
              </p>
              <BrandButton
                size="xl"
                style={
                  {
                    "--surface-base": "#fbfbfa",
                    "--surface-lit": "#e6e6e3",
                  } as React.CSSProperties
                }
              >
                Hero CTA
              </BrandButton>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>Tray + card — signature layering</Eyebrow>
          <div className="bs-tray">
            <div className="grid gap-1.5 sm:grid-cols-3">
              {[
                "Chat that ships",
                "Agents in your cloud",
                "Connectors, gated",
              ].map((t) => (
                <div key={t} className="bs-card p-5">
                  <h3 className="text-xl font-normal tracking-[-0.02em]">
                    {t}
                  </h3>
                  <p className="mt-2 text-sm/6 text-(--bs-paper)/60">
                    tray rounded-[20px] p-1.5 + shadow-tray; card rounded-[14px]
                    bg-white + shadow-card.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>Reveal — scroll choreography with no-JS fallback</Eyebrow>
          <div className="space-y-4">
            {[0, 0.08, 0.16].map((delay, i) => (
              <Reveal
                key={i}
                delay={delay}
                blur={8}
                className="bs-card p-6 text-sm text-(--bs-paper)/70"
              >
                Reveal block {i + 1} — IntersectionObserver flips
                data-reveal=&quot;pending&quot; to the landing-rise animation.
                With JS disabled the CSS never hides content.
              </Reveal>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>Dither — image + canvas pattern</Eyebrow>
          <div className="bs-tray p-4">
            <div className="bs-card p-6 flex flex-wrap items-center gap-10">
              <DitherCanvas
                src={DEMO_ART}
                width={480}
                height={320}
                alt="Dither demo art"
              />
              <p className="max-w-[42ch] text-sm/6 text-(--bs-paper)/60">
                pixelated raster under a canvas the client repaints with a
                drifting Bayer-8×8 dither (ink #3C3C3C @ 37%, gamma 1.4, 2px
                dots). Static under prefers-reduced-motion.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <Eyebrow>Chat composer — AffectUI classic rebuild</Eyebrow>
          <div className="bs-tray p-4">
            <div className="p-6 space-y-10">
              <div>
                <p className="text-sm text-(--bs-paper)/55 mb-3">Light theme</p>
                <ChatComposer theme="light" />
              </div>
              <div className="dark p-8 rounded-2xl bg-neutral-950">
                <p className="text-sm text-neutral-400 mb-3">Dark theme</p>
                <ChatComposer theme="dark" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
