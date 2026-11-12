"use client";

import { cn } from "@/lib/utils";

/**
 * Display-surface accent span (design-system extension mod): italic serif
 * with a paper→brand gradient and the 2.4px halftone dot mask. Always the
 * trailing words of a headline. Use inside .brand-surface containers.
 */
export function AccentSpan({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("bs-accent", className)}>{children}</span>;
}
