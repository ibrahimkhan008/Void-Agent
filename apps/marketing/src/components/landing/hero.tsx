"use client";

import { Dashboard } from "@/components/landing/dashboard";
import { Button, EASE, TOKENS, VoidAgentMark } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import { IconArrowRight, IconMenu2, IconX } from "@tabler/icons-react";
import {
  AnimatePresence,
  type MotionValue,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { APP_URL } from "lib/site";
import { Fragment, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#workflows", label: "Workflows" },
  { href: "#models", label: "Models" },
  { href: "#pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

const PARTNERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "Groq",
  "Z AI",
  "Cloudvoid-agent",
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const parallaxY = useTransform(
    scrollYProgress,
    [0, 1],
    [0, reduceMotion ? 0 : 140],
  );

  const reveal = (delay: number) => ({
    initial: {
      opacity: 0,
      y: reduceMotion ? 0 : 12,
      filter: reduceMotion ? "blur(0px)" : "blur(10px)",
    },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  const headline = [
    ["Autonomous", "AI", "agents,"],
    ["on", "any", "model"],
  ];

  return (
    <div
      style={TOKENS}
      className="relative isolate min-h-dvh overflow-x-clip bg-(--ink) text-(--paper) scheme-only-dark"
    >
      <SiteHeader />

      <section ref={heroRef} className="relative isolate">
        <Landscape y={parallaxY} />

        <div className="relative z-10 flex flex-col items-center px-6 pt-36 text-center sm:pt-44">
          <motion.a
            {...reveal(0)}
            href="#workflows"
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-white/5 py-1 pr-3 pl-1 text-sm text-(--paper)/80 inset-ring inset-ring-white/10 backdrop-blur-sm hover:bg-white/10",
              focusRing,
            )}
          >
            <span className="rounded-full bg-(--paper) px-2 py-0.5 text-xs font-medium text-(--ink)">
              New
            </span>
            Schedules: prompts that run on their own
          </motion.a>

          <h1 className="mt-8 max-w-[20ch] text-5xl font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {headline.map((line, row) => (
              <span key={row}>
                {line.map((word, i) => (
                  <Fragment key={word}>
                    <motion.span
                      {...reveal(0.1 + (row * 3 + i) * 0.06)}
                      className="inline-block"
                    >
                      {word}
                    </motion.span>
                    {i < line.length - 1 && " "}
                  </Fragment>
                ))}
                {row === 0 && (
                  <>
                    {" "}
                    <br className="max-sm:hidden" />
                  </>
                )}
              </span>
            ))}
          </h1>

          <motion.p
            {...reveal(0.55)}
            className="mt-6 max-w-[48ch] text-base text-pretty text-(--paper)/70 sm:text-lg"
          >
            Build and ship full-stack apps in the cloud with Claude, GPT,
            Gemini, Groq and more — one workspace, any model.
          </motion.p>

          <motion.div
            {...reveal(0.65)}
            className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:gap-8"
          >
            <Button href={`${APP_URL}/sign-up`} scheme="dark" size="lg" rounded>
              Start building free
              <IconArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <p className="text-sm text-(--paper)/60">
              <span className="font-medium text-(--paper)">Free plan</span>
              <br />
              No credit card required
            </p>
          </motion.div>
        </div>

        <div className="relative z-10 mx-auto mt-16 max-w-6xl px-4 [perspective:1800px] sm:mt-20 sm:px-6">
          <motion.div
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, rotateX: 28, y: 80, scale: 1 }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, rotateX: 0, y: 0, scale: [1, 1.03, 1] }
            }
            transition={
              reduceMotion
                ? { duration: 0.4, delay: 0.3 }
                : {
                    opacity: { duration: 0.6, delay: 0.45, ease: "easeOut" },
                    y: { duration: 1.1, delay: 0.45, ease: EASE },
                    rotateX: {
                      duration: 1.6,
                      delay: 1.35,
                      ease: [0.45, 0, 0.2, 1],
                    },
                    scale: {
                      duration: 2.2,
                      delay: 1.35,
                      times: [0, 0.55, 1],
                      ease: [
                        [0.45, 0, 0.55, 1],
                        [0.33, 1, 0.68, 1],
                      ],
                    },
                  }
            }
            style={{
              transformOrigin: "50% 100%",
              willChange: "transform, opacity",
              backfaceVisibility: "hidden",
            }}
          >
            <Dashboard />
          </motion.div>
        </div>

        <div className="relative z-30 mx-auto max-w-6xl px-6 pt-10 pb-16 text-center">
          <motion.p {...reveal(1.2)} className="text-sm text-(--paper)/60">
            Built with our technology partners
          </motion.p>
          <ul
            role="list"
            className="mt-6 grid grid-cols-3 items-center justify-items-center gap-x-8 gap-y-6 sm:grid-cols-6"
          >
            {PARTNERS.map((partner, i) => (
              <motion.li
                key={partner}
                {...reveal(1.3 + i * 0.07)}
                className="flex h-14 items-center sm:h-16"
              >
                <span className="text-lg font-semibold tracking-tight text-(--paper)/70">
                  {partner}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Landscape({
  y,
  className,
}: {
  y: MotionValue<number>;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <motion.div style={{ y }} className="absolute inset-x-0 -top-40 bottom-0">
        <img
          src="/images/landscape.webp"
          alt=""
          width={1672}
          height={941}
          fetchPriority="high"
          className="size-full object-cover object-[center_75%]"
        />
      </motion.div>
      <div className="absolute inset-0 bg-(--ink)/55" />
      <div className="absolute inset-0 bg-(--rust)/40 mix-blend-multiply" />
      <div className="absolute inset-x-0 top-0 h-[58%] bg-linear-to-b from-(--dusk) via-(--ink-2)/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-(--ink) via-(--ink)/70 to-transparent" />
    </div>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <motion.header
      initial={false}
      animate={{
        backgroundColor: open
          ? "rgba(10, 10, 10, 0.78)"
          : "rgba(10, 10, 10, 0)",
      }}
      transition={{ duration: 0.25 }}
      className={cn(
        "absolute inset-x-0 top-0 z-50",
        open && "backdrop-blur-md",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"
      >
        <a
          href="/"
          aria-label="Homepage"
          className={cn("flex items-center gap-2.5 rounded-sm", focusRing)}
        >
          <VoidAgentMark className="size-7" />
          <span className="text-lg font-semibold tracking-tight">
            Void Agent
          </span>
        </a>

        <ul role="list" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={cn(
                  "rounded-sm text-sm text-(--paper)/70 hover:text-(--paper)",
                  focusRing,
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
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
          aria-controls="mobile-menu"
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
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="px-6 pb-6 lg:hidden"
          >
            <ul
              role="list"
              className="flex flex-col border-t border-white/10 pt-4"
            >
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-md py-2.5 text-base text-(--paper)/80 hover:text-(--paper)",
                      focusRing,
                    )}
                  >
                    {link.label}
                  </a>
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
