import type { Metadata } from "next";
import Link from "next/link";

/**
 * Cognix legal article layout (§5 / §7).
 *
 * Structure: light brand-surface page → floating pill navbar space →
 * centered hero (eyebrow version line + display H1 + sub) → two-column
 * grid (sticky TOC sidebar + article body).
 *
 * Sections render with the exact Cognix treatment:
 * - H2: `mt-16 scroll-mt-28 border-t border-black/10 pt-12 text-3xl
 *   font-normal tracking-[-0.03em] text-balance text-(--paper)`
 * - Body: `mt-5 text-(--paper)/75`
 * - Lists: `list-disc space-y-2 pl-5 marker:text-(--brand-glow)`
 * - Links: `text-(--brand) underline decoration-(--brand)/30 underline-offset-4`
 * - Tables: `border-t border-black/[0.06]` with `text-sm/6`
 */

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

export interface LegalPageProps {
  title: string;
  description: string;
  version?: string;
  effective?: string;
  updated?: string;
  sections: LegalSection[];
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

export function LegalPage({
  title,
  description,
  version,
  effective,
  updated,
  sections,
}: LegalPageProps) {
  return (
    <div className="brand-surface min-h-dvh">
      {/* Hero: centered, display-scale, matches Cognix legal pages. */}
      <section className="mx-auto max-w-3xl px-6 pt-32 pb-14 text-center sm:pt-40">
        {version && (
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-(--paper)/45 font-mono">
            {version}
            {effective && ` · Effective ${effective}`}
            {updated && ` · Updated ${updated}`}
          </p>
        )}
        <h1 className="mt-6 text-5xl leading-[1.03] font-normal tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        <p className="mt-5 text-lg/[1.55] text-(--paper)/60 max-w-[560px] mx-auto">
          {description}
        </p>
      </section>

      {/* Two-column grid: sticky TOC sidebar + article body. */}
      <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-32 lg:grid-cols-[240px_1fr] lg:gap-16">
        {/* Sticky TOC sidebar. */}
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-28 space-y-1">
            <p className="mb-3 px-4 text-[11px] font-medium tracking-[0.12em] uppercase text-(--paper)/45 font-mono">
              On this page
            </p>
            {sections.map((section, i) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex items-start gap-2.5 rounded-lg px-4 py-1.5 text-sm text-(--paper)/55 transition-colors duration-150 hover:text-(--paper) hover:bg-white/50"
              >
                <span className="w-5 shrink-0 text-[11px]/6 text-(--paper)/40 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Article body. */}
        <article className="min-w-0 max-w-[72ch]">
          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="mt-16 scroll-mt-28 border-t border-black/10 pt-12 text-3xl font-normal tracking-[-0.03em] text-balance text-(--paper) first:mt-12">
                {section.title}
              </h2>
              <div className="mt-5 space-y-5 text-base/7 text-(--paper)/75">
                {section.body}
              </div>
            </section>
          ))}

          {/* Footer: back link. */}
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
    <div className="mt-5 overflow-x-auto rounded-2xl bg-white border border-black/[0.08] shadow-sm">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-(--ink-2)/60">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-[11px] font-medium tracking-[0.12em] uppercase text-(--paper)/55"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-black/[0.06] hover:bg-black/[0.015]"
            >
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
  );
}
