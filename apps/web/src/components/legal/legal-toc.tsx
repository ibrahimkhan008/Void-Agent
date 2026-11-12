"use client";

import { cn } from "lib/utils";
import { useEffect, useState } from "react";

/**
 * Scroll-spy "On this page" nav for the legal article layout.
 *
 * Tracks which section heading has most recently crossed the top band of the
 * viewport (matching cognixai.in): the active item gets the brand-glow left
 * border and full-ink label; every other item stays muted. Without JS the
 * first item renders as active, matching the static fallback.
 */
export function LegalToc({
  sections,
}: {
  sections: Array<{ id: string; title: string }>;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );

  useEffect(() => {
    const ids = sections.map((s) => s.id);
    const onScroll = () => {
      // A heading becomes active once its top passes this line; the last one
      // to cross wins. 140px sits just below the sticky offset (scroll-mt-28).
      const line = 140;
      let current: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) {
          current = id;
        }
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  return (
    <div className="space-y-0.5">
      <p className="mb-4 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
        On this page
      </p>
      {sections.map((section, i) => {
        const active = section.id === activeId;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={cn(
              "-ml-px flex gap-2.5 border-l py-1.5 pl-4 transition-[color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)",
              active
                ? "border-(--brand-glow) font-medium text-(--paper)"
                : "border-transparent text-(--paper)/55 hover:text-(--paper)",
            )}
          >
            <span
              className={cn(
                "w-5 shrink-0 text-[11px]/6 tabular-nums",
                active ? "text-(--paper)/70" : "text-(--paper)/40",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {section.title}
          </a>
        );
      })}
    </div>
  );
}
