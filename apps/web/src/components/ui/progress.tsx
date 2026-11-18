"use client";

import * as React from "react";

/**
 * Minimal usage-bar: the design system has no Radix progress primitive, and
 * the Devices quota rows only need a filled track.
 */
const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={`h-2 w-full overflow-hidden rounded-full bg-secondary ${className ?? ""}`}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    {...props}
  >
    <div
      className="h-full rounded-full bg-primary transition-all"
      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
