"use client";

import { cn } from "@/lib/utils";
import { Asterisk } from "lucide-react";

/**
 * Display-surface eyebrow (design-system extension mod): mono micro-label
 * with the brand-glow asterisk. Use inside .brand-surface containers.
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
        "inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-(--bs-paper)/55 uppercase font-mono",
        className,
      )}
    >
      {withAsterisk && (
        <Asterisk className="size-3.5 stroke-[2.5] text-(--bs-brand-glow)" />
      )}
      {children}
    </p>
  );
}
