import { cn } from "lib/utils";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccentSpan } from "@/components/ui/accent-span";
import { BrandButtonLink } from "@/components/ui/brand-button";
import { LegalToc, LegalTocCollapsible } from "./legal-toc";

/**
 * Cognix legal article layout — exact clone of cognixai.in legal pages.
 */

export interface LegalSection {
  id: string;
  title: string;
  /** Plain label for the TOC rail when `title` carries its own number
      ("1. Introduction" → tocTitle "Introduction"); TOC numbers itself. */
  tocTitle?: string;
  body: React.ReactNode;
}

export interface LegalPageProps {
  /** Eyebrow label (e.g., "Legal") */
  eyebrow?: string;
  /** The normal-text part of the display H1 */
  title: string;
  /** The Instrument Serif accent word(s) — rendered after the title */
  accentTitle?: string;
  description: string;
  version?: string;
  effective?: string;
  updated?: string;
  /** Intro paragraph shown before the first section */
  introParagraph?: string;
  sections: LegalSection[];
  siblings?: Array<{ label: string; href: string }>;
  /** Index of the currently active sibling pill */
  activeSibling?: number;
}

export function legalMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description },
  };
}

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Changelog", href: "/changelog" },
];

export function LegalPage({
  eyebrow = "Legal",
  title,
  accentTitle,
  description,
  version,
  effective,
  updated,
  introParagraph,
  sections,
  siblings = [],
  activeSibling,
}: LegalPageProps) {
  return (
    <div className="brand-surface min-h-dvh w-full overflow-x-clip">
      {/* ===== Floating pill navbar (Cognix §4.1) ===== */}
      <header className="landing-drop fixed inset-x-3 z-100 mx-auto max-w-7xl rounded-2xl backdrop-blur-xl transition-[top,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] top-3 sm:inset-x-4 sm:top-4 bg-(--ink-2)/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
        <nav
          aria-label="Main"
          className="grid h-[60px] grid-cols-[1fr_auto] items-center gap-4 pr-2.5 pl-4 md:grid-cols-[1fr_auto_1fr]"
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="relative block shrink-0 size-7">
                <Image
                  src="/logo-192.webp"
                  alt="Void-Agent"
                  width={28}
                  height={28}
                  className="object-contain"
                  priority
                />
              </span>
              <span className="text-[17px] font-medium tracking-[-0.01em] text-(--paper)">
                Void-Agent
              </span>
            </Link>
          </div>

          {/* Center pill nav (desktop only) — links inside a tray chip */}
          <div className="hidden items-center rounded-xl bg-black/[0.035] p-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3.5 py-1.5 text-[13.5px] transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--paper)/40 text-(--paper)/60 hover:text-(--paper) hover:bg-white/70"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Log in (outline) + Start free (primary + arrow, glow sweep) */}
          <div className="flex items-center justify-end gap-2">
            <BrandButtonLink
              variant="outline"
              size="md"
              href="/sign-in"
              className="hidden sm:inline-flex"
            >
              Log in
            </BrandButtonLink>
            <BrandButtonLink variant="default" size="md" href="/sign-up">
              Start free
              <ArrowRight data-icon="end" />
            </BrandButtonLink>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="mx-auto max-w-3xl px-6 pt-40 pb-14 text-center sm:pt-48">
        {/* Eyebrow: green asterisk + uppercase mono label */}
        <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-(--paper)/55 uppercase">
          <span className="text-(--brand-glow)">*</span>
          {eyebrow}
        </div>
        {/* Display H1: normal part + dithered serif accent word(s) */}
        <h1 className="mt-6 text-5xl leading-[1.03] font-normal tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
          {title}
          {accentTitle && (
            <>
              {" "}
              <AccentSpan>{accentTitle}</AccentSpan>
            </>
          )}
        </h1>
        <p className="mt-5 text-lg/8 text-pretty text-(--paper)/75 max-w-[560px] mx-auto">
          {description}
        </p>

        {/* Version line: EFFECTIVE <date> · UPDATED <date> · VERSION <version> */}
        {(effective || updated || version) && (
          <p className="mt-8 text-[11px] tracking-[0.14em] text-(--paper)/45 uppercase">
            {effective && (
              <>
                <span className="font-medium">Effective</span>
                <span className="ml-1 normal-case text-(--paper)/75">
                  {effective}
                </span>
              </>
            )}
            {updated && (
              <>
                <span className="mx-2">·</span>
                <span className="font-medium">Updated</span>
                <span className="ml-1 normal-case text-(--paper)/75">
                  {updated}
                </span>
              </>
            )}
            {version && (
              <>
                <span className="mx-2">·</span>
                <span className="font-medium">Version</span>
                <span className="ml-1 normal-case text-(--paper)/75">
                  {version}
                </span>
              </>
            )}
          </p>
        )}
      </section>

      {/* ===== Sibling document pills (centered) ===== */}
      {siblings.length > 0 && (
        <nav
          aria-label="Legal documents"
          className="mx-auto max-w-3xl px-6 pb-8 flex justify-center"
        >
          <div className="max-w-full overflow-x-auto rounded-xl bg-black/[0.04] p-1 [scrollbar-width:none] flex gap-1">
            {siblings.map((sib, i) => (
              <Link
                key={sib.href}
                href={sib.href}
                className={cn(
                  "block rounded-lg px-3.5 py-1.5 text-[13.5px] whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--paper)/40",
                  i === activeSibling
                    ? "bg-white text-(--paper) rounded-xl"
                    : "text-(--paper)/60 hover:text-(--paper) hover:bg-white/70",
                )}
              >
                {sib.label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* ===== Mobile "On this page" collapsible (cognix §7.7) ===== */}
      {sections.length > 0 && (
        <div className="mx-auto max-w-3xl px-6 pb-10 lg:hidden">
          <LegalTocCollapsible
            sections={sections.map((s) => ({
              id: s.id,
              title: s.tocTitle ?? s.title,
            }))}
          />
        </div>
      )}

      {/* ===== Two-column grid: sticky TOC sidebar + article ===== */}
      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-32 lg:grid-cols-[240px_1fr] lg:gap-16">
        {/* Sticky TOC sidebar — scroll-spy: active item follows the reader.
            self-start keeps the nav at content height: a stretched grid item
            fills its column, leaving sticky zero room to travel. */}
        <nav
          aria-label={`${eyebrow} sections`}
          className="sticky top-28 hidden self-start text-sm lg:block"
        >
          <LegalToc
            sections={sections.map((s) => ({
              id: s.id,
              title: s.tocTitle ?? s.title,
            }))}
          />
        </nav>

        {/* Article body */}
        <article className="min-w-0 max-w-[72ch]">
          {/* Intro paragraph before the first section */}
          {introParagraph && (
            <p className="text-base/7 text-(--paper)/70 mb-2">
              {introParagraph}
            </p>
          )}
          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="mt-12 scroll-mt-28 border-t border-black/10 pt-12 text-3xl font-normal tracking-[-0.03em] text-balance text-(--paper) first:mt-12">
                {section.title}
              </h2>
              <div className="space-y-0 text-base/7 text-(--paper)/75">
                {section.body}
              </div>
            </section>
          ))}

          {/* Bottom back link */}
          <div className="mt-16 border-t border-black/10 pt-8">
            <Link
              href="/"
              className="text-sm text-(--paper)/55 transition-colors duration-150 hover:text-(--paper) hover:underline underline-offset-4"
            >
              ← Back to Void-Agent
            </Link>
          </div>
        </article>
      </div>

      {/* ===== Footer ===== */}
      <footer className="border-t border-(--paper)/6 bg-(--ink) text-(--paper)">
        <div className="mx-auto max-w-7xl px-6 pt-14 pb-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="relative block shrink-0 size-7">
                  <Image
                    src="/logo-192.webp"
                    alt="Void-Agent"
                    width={28}
                    height={28}
                    className="object-contain"
                  />
                </span>
                <span className="text-base font-medium">Void-Agent</span>
              </div>
              <p className="mt-3 max-w-[40ch] text-sm/6 text-(--paper)/55">
                An AI workspace for getting things done.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-12 gap-y-6">
              <div>
                <p className="text-sm font-medium">Legal</p>
                <ul className="mt-3 space-y-2">
                  {[
                    { label: "Terms of Service", href: "/terms-of-service" },
                    { label: "Privacy Policy", href: "/privacy-policy" },
                    { label: "Cookies Policy", href: "/cookies-policy" },
                    { label: "Refund Policy", href: "/refund-policy" },
                    {
                      label: "Grievance Redressal",
                      href: "/grievance-redressal",
                    },
                  ].map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-(--paper)/55 transition-colors duration-150 hover:text-(--paper) hover:underline underline-offset-4"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-(--paper)/6 pt-6">
            <p className="text-sm text-(--paper)/45">
              © 2026 Void-Agent. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Cognix legal body helpers — exact classes from the original pages. */

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="mt-5">{children}</p>;
}

export function LegalUl({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-5 list-disc space-y-2 pl-5 marker:text-(--brand-glow)">
      {children}
    </ul>
  );
}

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-(--brand) underline decoration-(--brand)/30 underline-offset-4 transition-colors duration-150 hover:decoration-(--brand)"
    >
      {children}
    </Link>
  );
}

export function LegalStrong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-(--paper)">{children}</span>;
}

export function LegalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    /* Cognix tray+card layering: big rounded tray in ink-2 holding a small
       white card (§7.7) — .bs-tray/.bs-card carry the radii and shadows. */
    <div className="bs-tray mt-6 overflow-x-auto">
      <div className="bs-card overflow-hidden">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="bg-(--ink-2)/60 px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.12em] text-(--paper)/55 uppercase"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="border-t border-black/[0.06] px-4 py-3 align-top text-sm/6 text-(--paper)/75"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
