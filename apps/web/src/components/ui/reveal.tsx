"use client";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "framer-motion";
import { createElement, useEffect, useRef, useState } from "react";

/**
 * Reveal wrapper (design-system extension mod): progressive-enhancement
 * scroll choreography. SSR renders data-reveal="pending"; the hidden state
 * only applies under the root `.js` class (set by the pre-paint inline
 * script in the auth layout / shell), so no-JS visitors always see content.
 * An IntersectionObserver flips pending → the landing-rise animation when
 * the block scrolls into view; prefers-reduced-motion skips straight to
 * visible. Use inside .brand-surface containers.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.7,
  rise = 14,
  blur = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  rise?: number;
  blur?: number;
  as?: "div" | "section" | "span" | "p";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduceMotion]);

  const style = {
    "--rise": `${rise}px`,
    "--rise-blur": `${blur}px`,
    "--rise-duration": `${duration}s`,
    "--rise-delay": `${delay}s`,
  } as React.CSSProperties;

  // createElement with the union tag sidesteps the JSX-props union blowup
  // ("Expression produces a union type that is too complex to represent").
  return createElement(
    Tag,
    {
      ref: ref as never,
      "data-reveal": shown ? "done" : "pending",
      style,
      className: cn(shown && "landing-rise", className),
    },
    children,
  );
}
