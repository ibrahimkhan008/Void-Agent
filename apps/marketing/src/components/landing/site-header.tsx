"use client";

import { Button, EASE, VoidAgentMark } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { APP_URL } from "lib/site";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

const focusRing =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)";

/**
 * Fixed top bar for every marketing page under the landing UI (the landing
 * itself keeps its in-hero header). Dark translucent surface, the Void Agent
 * mark chip, active-link state from the pathname, and the same mobile menu
 * pattern as the hero header.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <motion.header
      initial={false}
      animate={{
        backgroundColor: open
          ? "rgba(10, 10, 10, 0.9)"
          : "rgba(10, 10, 10, 0.7)",
      }}
      transition={{ duration: 0.25 }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] backdrop-blur-md"
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"
      >
        <Link
          href="/"
          aria-label="Homepage"
          className={cn("flex items-center gap-2.5", focusRing)}
        >
          <VoidAgentMark className="size-7" />
          <span className="text-lg font-semibold tracking-tight">
            Void Agent
          </span>
        </Link>

        <ul role="list" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-sm text-sm transition-colors",
                    active
                      ? "text-(--paper)"
                      : "text-(--paper)/70 hover:text-(--paper)",
                    focusRing,
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Button
            href={`${APP_URL}/sign-in`}
            variant="ghost"
            scheme="dark"
            rounded
          >
            Log in
          </Button>
          <Button
            href={`${APP_URL}/sign-up`}
            variant="secondary"
            scheme="dark"
            rounded
          >
            Start free
          </Button>
        </div>

        <Button
          variant="ghost"
          scheme="dark"
          size="icon-lg"
          rounded
          aria-expanded={open}
          aria-controls="site-header-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
          className="-mr-2 lg:hidden"
        >
          {open ? (
            <IconX className="size-5" />
          ) : (
            <IconMenu2 className="size-5" />
          )}
          <span
            className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
            aria-hidden="true"
          />
        </Button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="site-header-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="border-t border-white/[0.06] px-6 pb-6 lg:hidden"
          >
            <ul role="list" className="flex flex-col pt-4">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className={cn(
                      "block rounded-md py-2.5 text-base text-(--paper)/80 hover:text-(--paper)",
                      focusRing,
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <Button
                href={`${APP_URL}/sign-in`}
                variant="outline"
                scheme="dark"
                size="lg"
                rounded
                className="flex-1"
              >
                Log in
              </Button>
              <Button
                href={`${APP_URL}/sign-up`}
                variant="secondary"
                scheme="dark"
                size="lg"
                rounded
                className="flex-1"
              >
                Start free
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
