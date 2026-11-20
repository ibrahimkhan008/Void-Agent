"use client";

import { cn } from "@/lib/utils";
import { Asterisk } from "lucide-react";

/**
 * Display-surface eyebrow (design-system extension mod): mono micro-label
 * with the brand-glow asterisk. Inside .brand-surface the colors resolve from
 * the display tokens; outside that scope they fall back to the app theme so
 * the label stays muted (55%) and the asterisk keeps the Light Blue glow
 * instead of silently inheriting full-strength foreground.
 */
export function Eyebrow({
  children,
  className,
  withAsterisk = true,
}: {
  children: React.ReactNode;
  className?: string;
  withAsterisk?: boolean;
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-[var(--bs-paper,var(--foreground))]/55 uppercase font-mono",
        className,
      )}
    >
      {withAsterisk && (
        <Asterisk className="size-3.5 stroke-[2.5] text-[var(--bs-brand-glow,#a1a1aa)]" />
      )}
      {children}
    </p>
  );
}
