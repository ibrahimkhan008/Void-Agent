"use client";

import {
  Button,
  EASE,
  LANDSCAPE_SRC,
  Section,
  VoidAgentMark,
} from "@/components/landing/ui";
import { IconArrowRight } from "@tabler/icons-react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { APP_URL } from "lib/site";
import { type PointerEvent, useId } from "react";

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const DITHER = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" shape-rendering="crispEdges">${BAYER.flatMap(
    (row, y) =>
      row.map((v, x) => {
        const l = Math.round(((v + 0.5) / 16) * 255);
        return `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${l},${l},${l})"/>`;
      }),
  ).join("")}</svg>`,
)}")`;

const REVEAL_RADIUS = 200;

export function Cta() {
  const reduceMotion = !!useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  const spring = { stiffness: 180, damping: 26, mass: 0.6 };
  const mouseX = useSpring(-1000, spring);
  const mouseY = useSpring(-1000, spring);
  const radius = useMotionValue(0);
  const mask = useMotionTemplate`radial-gradient(circle ${radius}px at ${mouseX}px ${mouseY}px, transparent 30%, black 100%)`;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (reduceMotion || radius.get() === 0) {
      mouseX.jump(x);
      mouseY.jump(y);
    } else {
      mouseX.set(x);
      mouseY.set(y);
    }
  };

  const setReveal = (to: number) => {
    animate(
      radius,
      to * REVEAL_RADIUS,
      reduceMotion ? { duration: 0 } : { duration: 0.45, ease: EASE },
    );
  };

  return (
    <Section
      id="get-started"
      labelledBy={`${id}-heading`}
      className="py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="rounded-[20px] bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          <div
            onPointerMove={onPointerMove}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setReveal(1);
            }}
            onPointerLeave={() => setReveal(0)}
            className="relative isolate flex min-h-[440px] flex-col justify-between overflow-hidden rounded-[14px] bg-[#0a0a0a] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)] sm:min-h-[480px] sm:p-10"
          >
            <img
              src={LANDSCAPE_SRC}
              alt=""
              aria-hidden
              className="absolute inset-0 -z-10 size-full object-cover object-[50%_62%] saturate-[1.15]"
            />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 opacity-45 mix-blend-overlay [image-rendering:pixelated]"
              style={{
                backgroundImage: DITHER,
                backgroundSize: "6px 6px",
                maskImage: mask,
                WebkitMaskImage: mask,
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-(--ink)/80 via-(--ink)/15 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-2/5 bg-linear-to-b from-(--ink)/50 to-transparent"
            />

            <motion.a
              href="/"
              aria-label="Homepage"
              initial={{
                opacity: 0,
                filter: reduceMotion ? "blur(0px)" : "blur(6px)",
              }}
              whileInView={{ opacity: 1, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="flex w-fit items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--paper)"
            >
              <VoidAgentMark className="size-10" />
              <span className="text-xl font-semibold tracking-tight">
                Void Agent
              </span>
            </motion.a>

            <div className="mt-24 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <motion.h2
                id={`${id}-heading`}
                initial={{
                  opacity: 0,
                  y: reduceMotion ? 0 : 12,
                  filter: reduceMotion ? "blur(0px)" : "blur(8px)",
                }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                className="max-w-[16ch] text-4xl tracking-tight text-balance sm:text-5xl lg:text-6xl"
              >
                Ready to hand off <br className="max-sm:hidden" />
                your first task?
              </motion.h2>
              <motion.div
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
                className="flex flex-wrap gap-3"
              >
                <Button
                  href={`${APP_URL}/sign-up`}
                  scheme="dark"
                  size="lg"
                  rounded
                >
                  Start building free
                  <IconArrowRight data-icon="inline-end" aria-hidden />
                </Button>
                <Button
                  href="/docs"
                  variant="secondary"
                  scheme="dark"
                  size="lg"
                  rounded
                >
                  Read the docs
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
