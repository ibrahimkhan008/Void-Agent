import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact Void-Agent — Support, Sales, Security & Privacy",
  description:
    "How to reach Void-Agent: support, sales, security disclosure and privacy request addresses, expected response times, community channels and business details.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      {/* Hero with dot-grid backdrop */}
      <section
        className="relative border-b border-black/[0.06] pt-36 pb-16 sm:pt-44 sm:pb-24"
        style={{ colorScheme: "light" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(18,18,18,0.25) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <Eyebrow>Get in touch</Eyebrow>
          <h1 className="mt-5 max-w-[22ch] text-4xl leading-[1.08] font-normal tracking-[-0.035em] text-balance text-(--paper) sm:text-5xl lg:text-6xl">
            We&apos;re Here to Help You <AccentSpan>Build & Scale.</AccentSpan>
          </h1>
          <p className="mt-6 max-w-[70ch] text-lg/8 text-pretty text-(--paper)/60">
            Whether you are evaluating enterprise agent infrastructure,
            reporting a technical issue, disclosing a security vulnerability, or
            building on our developer API, our dedicated teams are ready to
            assist.
          </p>
        </div>
      </section>

      <ContactForm />

      <PublicFooter />
    </div>
  );
}
