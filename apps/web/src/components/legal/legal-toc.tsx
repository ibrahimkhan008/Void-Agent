"use client";

import { cn } from "lib/utils";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll-spy "On this page" nav for the legal article layout.
 *
 * Tracks which section heading has most recently crossed the top band of the
 * viewport (matching void-agentai.in): the active item gets a brand-glow segment
 * on the continuous rail; every other item stays muted. Without JS the first
 * item renders as active, matching the static fallback.
 *
 * Long documents (Terms has 20 sections) bound the list at 100vh-8rem and
 * scroll it internally. The native scrollbar is hidden and replaced by a
 * custom minimal one (probed from the live site): a 4px full-height track at
 * the right edge of a `group/scroll relative` wrapper, with a paper/15 thumb
 * sized clientHeight/scrollHeight × trackH, offset scrollTop/scrollHeight ×
 * trackH, deepening to /25 on group hover and /35 on thumb hover.
 *
 * Two wrappers render the same list: the desktop sticky rail (LegalToc) and
 * the mobile collapsible (LegalTocCollapsible, design system §7.7's tray button with
 * a rotating chevron above the article).
 */

function useTocState(sections: Array<{ id: string }>) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [thumb, setThumb] = useState({ height: 0, offset: 0 });
  const [marker, setMarker] = useState({ top: 0, height: 0 });
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

  // The green rail segment slides to the active item (void-agent style: one
  // continuous hairline behind the list, a brand-glow bar on the active one).
  const updateMarker = useCallback(() => {
    const scroller = listRef.current;
    if (!scroller || !activeId) return;
    const active = scroller.querySelector<HTMLElement>(
      `a[href="#${activeId}"]`,
    );
    if (!active) return;
    setMarker({ top: active.offsetTop, height: active.offsetHeight });
  }, [activeId]);

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
    updateMarker();
    window.addEventListener("resize", updateThumb);
    return () => window.removeEventListener("resize", updateThumb);
  }, [updateThumb, updateMarker, sections]);

  return {
    activeId,
    thumb,
    marker,
    listRef,
    updateThumb,
    updateMarker,
  };
}

function TocList({
  sections,
  onNavigate,
  state,
}: {
  sections: Array<{ id: string; title: string }>;
  onNavigate?: () => void;
  state: ReturnType<typeof useTocState>;
}) {
  const { activeId, thumb, marker, listRef, updateThumb } = state;
  return (
    <div className="group/scroll relative">
      <div
        ref={listRef}
        onScroll={updateThumb}
        className="relative max-h-[calc(100vh-8rem)] overflow-y-auto pr-4 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Continuous rail line + the green segment on the active item.
            Both live inside the scroller so they scroll with the list;
            items themselves carry no border (a -ml-px border gets clipped
            by the overflow container). */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-(--paper)/10"
        />
        <div
          aria-hidden
          className="absolute left-0 w-[2px] rounded-full bg-(--brand-glow) transition-[top,height] duration-200"
          style={{ top: marker.top, height: marker.height }}
        />
        {sections.map((section, i) => {
          const active = section.id === activeId;
          // Hand-authored titles may carry their own "1." number; the rail's
          // 01/02 prefix replaces it.
          const label = section.title.replace(/^\d+[.)]\s+/, "");
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={onNavigate}
              className={cn(
                "flex gap-2.5 py-1.5 pl-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)",
                active
                  ? "font-medium text-(--paper)"
                  : "text-(--paper)/55 hover:text-(--paper)",
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
      {/* Custom minimal scrollbar track (design system §7.7 treatment) */}
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
  );
}

/** Desktop sticky rail. */
export function LegalToc({
  sections,
}: {
  sections: Array<{ id: string; title: string }>;
}) {
  const state = useTocState(sections);
  return (
    <div className="space-y-0.5">
      <p className="mb-4 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
        On this page
      </p>
      <TocList sections={sections} state={state} />
    </div>
  );
}

/**
 * Mobile collapsible (design system §7.7): a full-width tray button between the
 * sibling pills and the article; expanding reveals the same scroll-spy list.
 * Closes on item navigation.
 */
export function LegalTocCollapsible({
  sections,
}: {
  sections: Array<{ id: string; title: string }>;
}) {
  const [open, setOpen] = useState(false);
  const state = useTocState(sections);
  const panelId = "mobile-on-this-page";

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between rounded-xl bg-(--ink-2) px-4 py-3 text-sm font-medium text-(--paper) shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)"
      >
        On this page
        <ChevronDown
          className={cn(
            "size-4 text-(--paper)/50 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="mt-3">
          <TocList
            sections={sections}
            onNavigate={() => setOpen(false)}
            state={state}
          />
        </div>
      )}
    </div>
  );
}
