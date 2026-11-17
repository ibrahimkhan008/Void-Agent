import { ArrowRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BrandButtonLink } from "@/components/ui/brand-button";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact-sales" },
];

/** Shared floating navigation for public marketing pages. */
export function PublicHeader() {
  return (
    <header className="landing-drop fixed inset-x-3 top-3 z-100 mx-auto max-w-7xl rounded-2xl bg-(--ink-2)/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:inset-x-4 sm:top-4">
      <nav
        aria-label="Main"
        className="grid h-[60px] grid-cols-[1fr_auto] items-center gap-4 pr-2.5 pl-4 md:grid-cols-[1fr_auto_1fr]"
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/logo-va-512.webp"
            alt="Void Agent"
            width={28}
            height={28}
            className="size-7 shrink-0 object-contain"
            priority
          />
          <span className="truncate text-[17px] font-medium tracking-[-0.01em] text-(--paper)">
            Void Agent
          </span>
        </Link>

        <div className="hidden items-center rounded-xl bg-black/[0.035] p-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3.5 py-1.5 text-[13.5px] text-(--paper)/60 transition-colors hover:bg-white/70 hover:text-(--paper) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--paper)/40"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="grid size-9 place-items-center rounded-[10px] border border-black/10 text-(--paper)/70 md:hidden">
            <Menu className="size-4" aria-hidden />
            <span className="sr-only">Navigation links are available below</span>
          </span>
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
  );
}
