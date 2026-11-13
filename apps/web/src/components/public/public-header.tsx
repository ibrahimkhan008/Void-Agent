"use client";

import { cn } from "lib/utils";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

// isActive is injected by the server page via the current pathname —
// the header itself stays a pure client component. Read it from location.
function useActiveHref() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => setActive(window.location.pathname), []);
  return active;
}

/**
 * Floating pill navbar shared by every public marketing page (§4.1).
 * Condenses after 12px of scroll: top-3/4 → top-2, shadow strengthens.
 */
export function PublicHeader() {
  const [condensed, setCondensed] = useState(false);
  const active = useActiveHref();

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-3 z-100 mx-auto max-w-7xl rounded-2xl backdrop-blur-xl transition-[top,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:inset-x-4",
        condensed ? "top-2 sm:top-2" : "top-3 sm:top-4",
        condensed
          ? "bg-(--ink-2)/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.18)]"
          : "bg-(--ink-2)/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]",
      )}
    >
      <nav
        aria-label="Main"
        className="grid h-[60px] grid-cols-[1fr_auto] items-center gap-4 pr-2.5 pl-4 md:grid-cols-[1fr_auto_1fr]"
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative block shrink-0 size-7">
              <Image
                src="/logo-va-512.webp"
                alt="Void Agent"
                width={28}
                height={28}
                className="object-contain"
                priority
              />
            </span>
            <span className="text-[17px] font-medium tracking-[-0.01em] text-(--paper)">
              Void Agent
            </span>
          </Link>
        </div>

        {/* Center pill nav (desktop only) */}
        <div className="hidden items-center rounded-xl bg-black/[0.035] p-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active === link.href ? "page" : undefined}
              className={cn(
                "block rounded-lg px-3.5 py-1.5 text-[13.5px] transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--paper)/40",
                active === link.href
                  ? "bg-white text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-(--paper)/60 hover:text-(--paper) hover:bg-white/70",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right: Log in (outline) + Start free (primary + arrow, glow sweep) */}
        <div className="flex items-center justify-end gap-2">
          <Link
            href="/sign-in"
            className="hidden h-9 items-center rounded-[10px] border border-black/[0.15] bg-white px-4 text-sm font-medium text-(--paper) shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors duration-150 hover:bg-(--ink-2) sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="bs-btn bs-btn-default h-9 rounded-[10px] px-4 text-sm"
          >
            Start free
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              data-icon="end"
              className="lucide lucide-arrow-right"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      </nav>
    </header>
  );
}
