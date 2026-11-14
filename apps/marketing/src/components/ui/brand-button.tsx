"use client";

import { cn } from "@/lib/utils";

export type BrandButtonVariant = "default" | "outline" | "secondary";
export type BrandButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Display-surface button system (design-system extension mod). Independent
 * of the app's shadcn Button: per-instance --surface-* tokens drive the
 * layered ::before ring/edge gradient and the ::after dotted brand-glow
 * sweep; press feedback is active:scale with a motion-reduce opt-out.
 * Use for marketing/display surfaces, not for app chrome.
 */
const VARIANT_CLASSES: Record<BrandButtonVariant, string> = {
  default: "bs-btn-default",
  outline: "bs-btn-outline",
  secondary: "bs-btn-secondary",
};

const SIZE_CLASSES: Record<BrandButtonSize, string> = {
  xs: "h-7 px-3 text-xs",
  sm: "h-8 px-3.5 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
  xl: "h-11 px-6 text-[15px]",
};

const BASE =
  "bs-btn focus-visible:ring-3 focus-visible:ring-neutral-950/20 focus-visible:outline-none disabled:opacity-50";

export function BrandButton({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BrandButtonVariant;
  size?: BrandButtonSize;
}) {
  return (
    <button
      data-slot="brand-button"
      className={cn(
        BASE,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BrandButtonLink({
  variant = "default",
  size = "md",
  className,
  children,
  href,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: BrandButtonVariant;
  size?: BrandButtonSize;
  href: string;
}) {
  return (
    <a
      data-slot="brand-button"
      className={cn(
        BASE,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      href={href}
      {...props}
    >
      {children}
    </a>
  );
}
