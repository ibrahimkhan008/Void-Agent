"use client";

import { cn } from "lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll-spy "On this page" nav for the legal article layout.
 *
 * Tracks which section heading has most recently crossed the top band of the
 * viewport (matching cognixai.in): the active item gets the brand-glow left
 * border and full-ink label; every other item stays muted. Without JS the
 * first item renders as active, matching the static fallback.
 *
 * Long documents (Terms has 20 sections) bound the list at 100vh-8rem and
 * scroll it internally. The native scrollbar is hidden and replaced by a
 * custom minimal one (probed from the live site): a 4px full-height track at
 * the right edge of a `group/scroll relative` wrapper, with a paper/15 thumb
 * sized clientHeight/scrollHeight × trackH, offset scrollTop/scrollHeight ×
 * trackH, deepening to /25 on group hover and /35 on thumb hover.
 */
export function LegalToc({
  sections,
}: {
  sections: Array<{ id: string; title: string }>;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [thumb, setThumb] = useState({ height: 0, offset: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const updateThumb = useCallback(() => {
    const el = listRef.current;
    if (!el || el.clientHeight <= 0) return;
    const trackH = el.clientHeight;
    const ratio = el.scrollHeight > 0 ? trackH / el.scrollHeight : 1;
    setThumb({
      height: ratio * trackH,
      offset: (el.scrollTop / (el.scrollHeight || 1)) * trackH,
    });
  }, []);

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

  // Keep the active item visible inside the bounded list as the reader moves.
  useEffect(() => {
    if (!activeId) return;
    const scroller = listRef.current;
    const active = scroller?.querySelector(`a[href="#${activeId}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // Measure the thumb once laid out and on resize; scroller scrolls update it
  // via onScroll (scrollIntoView fires a scroll event, so it stays in sync).
  useEffect(() => {
    updateThumb();
    window.addEventListener("resize", updateThumb);
    return () => window.removeEventListener("resize", updateThumb);
  }, [updateThumb, sections]);

  return (
    <div className="space-y-0.5">
      <p className="mb-4 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
        On this page
      </p>
      <div className="group/scroll relative">
        <div
          ref={listRef}
          onScroll={updateThumb}
          className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-4 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((section, i) => {
            const active = section.id === activeId;
            // Hand-authored titles may carry their own "1." number; the rail's
            // 01/02 prefix replaces it.
            const label = section.title.replace(/^\d+[.)]\s+/, "");
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
                {label}
              </a>
            );
          })}
        </div>
        {/* Custom minimal scrollbar track (cognix §7.7 treatment) */}
        <div className="absolute inset-y-0 right-0 w-1">
          <div
            className="absolute inset-x-0 cursor-pointer rounded-full bg-(--paper)/15 transition-colors duration-150 group-hover/scroll:bg-(--paper)/25 hover:bg-(--paper)/35"
            style={{
              height: thumb.height,
              transform: `translateY(${thumb.offset}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
