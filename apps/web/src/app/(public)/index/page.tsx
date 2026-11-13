import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { DitherCanvas } from "@/components/ui/dither-canvas";
import { AccentSpan } from "@/components/ui/accent-span";
import { IndexPostsClient } from "./index-posts";

export const metadata: Metadata = {
  title:
    "Void Agent Index: Releases, Announcements, and Engineering Dispatches",
  description:
    "The official index of Void Agent product releases, AI research, model additions, and engineering architecture updates.",
  alternates: { canonical: "/index" },
};

export default function IndexPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* Hero */}
      <section className="relative border-b border-black/[0.06] pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div aria-hidden className="absolute inset-0 -z-10 opacity-40">
          <DitherCanvas
            src="/images/dither-footer.png"
            topFade
            className="h-full w-full object-cover [image-rendering:pixelated]"
          />
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-black/[0.12] bg-white/80 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.14em] text-(--paper)/70 uppercase">
            <span className="size-2 animate-pulse rounded-full bg-[#1CD86A]" />
            Void Agent index // 2026 releases
          </p>
          <h1 className="mt-6 max-w-[24ch] text-5xl leading-[1.05] font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-6xl lg:text-7xl">
            Index of <AccentSpan>releases</AccentSpan>, research & updates.
          </h1>
          <p className="mt-6 max-w-[70ch] text-lg/8 text-pretty text-(--paper)/60">
            The official log of architectural breakthroughs, product releases,
            model additions, and governance updates from the Void Agent
            engineering team.
          </p>
        </div>
      </section>

      {/* Filter bar + posts */}
      <div className="mx-auto max-w-6xl px-6 pt-12">
        <IndexPostsClient />
      </div>

      <PublicFooter />
    </div>
  );
}
