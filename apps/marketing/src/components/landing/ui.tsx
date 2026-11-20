"use client";

import { cn } from "@/lib/utils";
import { IconAsterisk } from "@tabler/icons-react";
import { type VariantProps, cva } from "class-variance-authority";
import type { LivelinePoint } from "liveline";
import Image from "next/image";
import {
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useState,
} from "react";

/**
 * Shared building blocks for the landing page. Every section uses these so
 * colors, type, buttons and spacing stay the same from top to bottom.
 * Colors come from the CSS variables in `TOKENS`, set on each section.
 *
 * Ported from the Kestrel landing template; Inter/Geist Mono resolve from
 * the next/font variables published by the root layout.
 */

export const FONT_SANS =
  "var(--font-inter), system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const FONT_MONO =
  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const MONO = { fontFamily: FONT_MONO } satisfies CSSProperties;

export const TOKENS = {
  "--ink": "#0a0a0a",
  "--ink-2": "#171717",
  "--dusk": "#171717",
  "--sand": "#c8b8a8",
  "--rust": "#6e4a3a",
  "--paper": "#f2efe9",
  "--canvas": "#f7f6f3",
  "--brand": "#0099ff",
  fontFamily: FONT_SANS,
} as CSSProperties;

export const EASE = [0.22, 1, 0.36, 1] as const;

export const LANDSCAPE_SRC = "/images/landscape.webp";

export const text = {
  h2: "text-4xl font-medium tracking-tight text-balance sm:text-5xl",
  lede: "text-base text-pretty text-(--paper)/65 sm:text-lg",
} as const;

export function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={TOKENS}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-6 bg-(--ink) text-(--paper)", className)}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 text-sm font-medium text-(--brand)">
      <span className="grid size-6 place-items-center rounded-md bg-(--brand)/15">
        <IconAsterisk className="size-3.5" stroke={2} aria-hidden />
      </span>
      {children}
    </p>
  );
}

/** Void Agent's logo as a light chip that reads on the dark landing. */
export function VoidAgentMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-va-512.webp"
      alt=""
      width={512}
      height={512}
      aria-hidden
      className={cn("rounded-[22%] bg-white object-contain p-[6%]", className)}
    />
  );
}

export function useLiveSeries({
  seed,
  step,
  intervalMs,
  active = true,
}: {
  seed: () => number[];
  step: (previous: number, index: number) => number;
  intervalMs: number;
  active?: boolean;
}) {
  const [data, setData] = useState<LivelinePoint[]>([]);

  useEffect(() => {
    const values = seed();
    const now = Date.now() / 1000;
    const history = values.map((value, i) => ({
      time: now - ((values.length - 1 - i) * intervalMs) / 1000,
      value,
    }));
    setData(history);
    if (!active) return;

    let index = values.length;
    const timer = setInterval(() => {
      setData((current) => {
        const last = current[current.length - 1];
        const next = {
          time: Date.now() / 1000,
          value: step(last.value, index++),
        };
        return [...current.slice(-(values.length - 1)), next];
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [seed, step, intervalMs, active]);

  return data;
}

const SURFACE =
  "[--surface-top:var(--surface-base)] [--surface-bottom:var(--surface-lit)] [--surface-strength:calc(var(--surface-calm,1)*100%)] [--surface-fall:color-mix(in_srgb,var(--surface-bottom)_var(--surface-strength),var(--surface-top))] before:[background:var(--surface-sheen)_padding-box,linear-gradient(var(--surface-top),var(--surface-fall))_padding-box,linear-gradient(color-mix(in_srgb,var(--surface-edge-top)_var(--surface-strength),transparent),color-mix(in_srgb,var(--surface-edge-mid)_var(--surface-strength),transparent),color-mix(in_srgb,var(--surface-edge-bottom)_var(--surface-strength),transparent))_border-box,linear-gradient(var(--surface-top),var(--surface-fall))_border-box] before:[box-shadow:0_0_0_1px_var(--surface-ring),inset_0_-3px_6px_-3px_color-mix(in_srgb,var(--surface-shade)_var(--surface-strength),transparent),0_1px_1px_0_color-mix(in_srgb,var(--surface-drop-near)_var(--surface-strength),transparent),0_2px_4px_0_color-mix(in_srgb,var(--surface-drop)_var(--surface-strength),transparent),0_8px_20px_-8px_color-mix(in_srgb,var(--surface-glow)_var(--surface-strength),transparent)]";

const LIGHTEN =
  "hover:[--surface-top:color-mix(in_srgb,var(--surface-base),white_6%)] hover:[--surface-bottom:color-mix(in_srgb,var(--surface-lit),white_6%)]";
const DARKEN =
  "hover:[--surface-top:color-mix(in_srgb,var(--surface-base),black_4%)] hover:[--surface-bottom:color-mix(in_srgb,var(--surface-lit),black_4%)]";
const EXPANDED_LIGHTEN =
  "aria-expanded:[--surface-top:color-mix(in_srgb,var(--surface-base),white_6%)] aria-expanded:[--surface-bottom:color-mix(in_srgb,var(--surface-lit),white_6%)]";
const EXPANDED_DARKEN =
  "aria-expanded:[--surface-top:color-mix(in_srgb,var(--surface-base),black_4%)] aria-expanded:[--surface-bottom:color-mix(in_srgb,var(--surface-lit),black_4%)]";

const EDGE_MID_MIX =
  "[--surface-edge-mid:color-mix(in_srgb,var(--surface-edge-top),var(--surface-edge-bottom))]";
const NO_SHEEN =
  "[--surface-sheen:linear-gradient(transparent,transparent)] [--surface-shade:transparent] [--surface-glow:transparent]";

const SURFACE_TOKENS = {
  light: {
    default: cn(
      "text-white [--surface-base:#303030] [--surface-lit:#1f1f1f] [--surface-edge-top:#4a4a4a] [--surface-edge-bottom:#171717] [--surface-ring:#0a0a0a] [--surface-drop-near:transparent] [--surface-drop:rgb(0_0_0/0.1)]",
      EDGE_MID_MIX,
      NO_SHEEN,
      LIGHTEN,
    ),
    secondary: cn(
      "text-neutral-900 [--surface-base:#f2f2f2] [--surface-lit:#eaeaea] [--surface-edge-top:rgb(255_255_255/0)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-edge-bottom:rgb(0_0_0/0.06)] [--surface-ring:rgb(0_0_0/0.11)] [--surface-drop-near:rgb(0_0_0/0.04)] [--surface-drop:rgb(0_0_0/0.05)]",
      NO_SHEEN,
      DARKEN,
    ),
    outline: cn(
      "text-neutral-900 [--surface-base:#ffffff] [--surface-lit:#f0f0f0] [--surface-edge-top:rgb(255_255_255/0)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-edge-bottom:rgb(0_0_0/0.1)] [--surface-ring:rgb(0_0_0/0.15)] [--surface-drop-near:rgb(0_0_0/0.06)] [--surface-drop:rgb(0_0_0/0.1)]",
      NO_SHEEN,
      DARKEN,
      EXPANDED_DARKEN,
    ),
    destructive: cn(
      "text-white [--surface-base:#d0262b] [--surface-lit:#b81a1f] [--surface-edge-top:rgb(255_255_255/0.28)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-edge-bottom:rgb(0_0_0/0.14)] [--surface-ring:#a11216] [--surface-drop-near:rgb(0_0_0/0.08)] [--surface-drop:rgb(0_0_0/0.1)]",
      NO_SHEEN,
      LIGHTEN,
    ),
  },
  dark: {
    default: cn(
      "text-neutral-950 [--surface-base:#f5f5f5] [--surface-lit:#dcdcdc] [--surface-sheen:linear-gradient(rgb(255_255_255/0.9),rgb(255_255_255/0)_45%)] [--surface-edge-top:rgb(255_255_255/0)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-edge-bottom:rgb(0_0_0/0.2)] [--surface-ring:#b8b8b8] [--surface-shade:rgb(0_0_0/0.12)] [--surface-drop-near:rgb(0_0_0/0.3)] [--surface-drop:rgb(0_0_0/0.4)] [--surface-glow:rgb(255_255_255/0.1)]",
      DARKEN,
    ),
    secondary: cn(
      "text-white [--surface-base:#262626] [--surface-lit:#303030] [--surface-edge-top:#4a4a4a] [--surface-edge-bottom:#2e2e2e] [--surface-ring:#1a1a1a] [--surface-drop-near:transparent] [--surface-drop:rgb(0_0_0/0.4)]",
      EDGE_MID_MIX,
      NO_SHEEN,
      LIGHTEN,
    ),
    outline: cn(
      "text-white [--surface-base:#1a1a1a] [--surface-lit:#141414] [--surface-edge-top:rgb(255_255_255/0)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-edge-bottom:rgb(0_0_0/0.3)] [--surface-ring:#2e2e2e] [--surface-drop-near:rgb(0_0_0/0.3)] [--surface-drop:rgb(0_0_0/0.4)]",
      NO_SHEEN,
      LIGHTEN,
      EXPANDED_LIGHTEN,
    ),
    destructive: cn(
      "text-white [--surface-base:#c8161b] [--surface-lit:#d0262b] [--surface-edge-top:#e45c60] [--surface-edge-bottom:#cd262b] [--surface-ring:#7a0d10] [--surface-drop-near:transparent] [--surface-drop:rgb(0_0_0/0.4)]",
      EDGE_MID_MIX,
      NO_SHEEN,
      LIGHTEN,
    ),
  },
} as const;

const PUSH = [
  "[--push-lift:5px] [--push-travel:4px] [--push-hover:1px]",
  "transition-[translate,box-shadow,color,outline-color] duration-190 ease-[cubic-bezier(0.22,1.32,0.36,1)] active:duration-110 active:ease-out motion-reduce:transition-none",
  "before:border-(--push-face) before:shadow-[inset_0_1px_0_0_var(--push-sheen)]",
  "shadow-[0_var(--push-lift)_0_0_var(--push-face),0_7px_8px_-6px_var(--push-cast)]",
  "hover:-translate-y-(--push-hover) hover:shadow-[0_calc(var(--push-lift)_+_var(--push-hover))_0_0_var(--push-face),0_9px_11px_-7px_var(--push-cast)]",
  "active:translate-y-(--push-travel) active:shadow-[0_calc(var(--push-lift)_-_var(--push-travel))_0_0_var(--push-face),0_2px_3px_-2px_var(--push-cast)]",
].join(" ");

const RAISED = ["default", "secondary", "outline", "destructive"] as const;

const buttonStyles = cva(
  "group/button relative isolate inline-flex shrink-0 items-center justify-center rounded-lg bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,box-shadow,outline-color,outline-offset] duration-150 ease-out motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:border before:border-transparent before:transition-[scale,background-color,border-color] before:duration-150 before:ease-out focus-visible:ring-3 motion-reduce:before:transition-none active:not-aria-[haspopup]:not-data-[variant=push]:before:scale-[0.99] data-pressed:not-data-[variant=push]:before:scale-[0.99] motion-reduce:active:before:scale-100 motion-reduce:data-pressed:before:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-red-500/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
        secondary: "",
        ghost: "",
        destructive: "",
        link: "underline-offset-4 hover:underline",
        push: PUSH,
      },
      scheme: {
        light: "focus-visible:ring-neutral-950/20",
        dark: "focus-visible:ring-white/40",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-4 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)]",
        "icon-lg": "size-9",
      },
      rounded: {
        true: "rounded-full",
        false: "",
      },
      flat: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { variant: [...RAISED], flat: false, class: SURFACE },
      { variant: "destructive", class: "focus-visible:ring-red-500/40" },

      {
        variant: "default",
        scheme: "light",
        flat: false,
        class: SURFACE_TOKENS.light.default,
      },
      {
        variant: "secondary",
        scheme: "light",
        flat: false,
        class: SURFACE_TOKENS.light.secondary,
      },
      {
        variant: "outline",
        scheme: "light",
        flat: false,
        class: SURFACE_TOKENS.light.outline,
      },
      {
        variant: "destructive",
        scheme: "light",
        flat: false,
        class: SURFACE_TOKENS.light.destructive,
      },
      {
        variant: "default",
        scheme: "dark",
        flat: false,
        class: SURFACE_TOKENS.dark.default,
      },
      {
        variant: "secondary",
        scheme: "dark",
        flat: false,
        class: SURFACE_TOKENS.dark.secondary,
      },
      {
        variant: "outline",
        scheme: "dark",
        flat: false,
        class: SURFACE_TOKENS.dark.outline,
      },
      {
        variant: "destructive",
        scheme: "dark",
        flat: false,
        class: SURFACE_TOKENS.dark.destructive,
      },

      {
        variant: "default",
        scheme: "light",
        flat: true,
        class:
          "text-white before:bg-neutral-900 hover:before:bg-neutral-900/80",
      },
      {
        variant: "default",
        scheme: "dark",
        flat: true,
        class: "text-neutral-950 before:bg-white hover:before:bg-white/80",
      },
      {
        variant: "outline",
        scheme: "light",
        flat: true,
        class:
          "text-neutral-900 before:border-black/10 before:bg-white hover:before:bg-neutral-100 aria-expanded:before:bg-neutral-100",
      },
      {
        variant: "outline",
        scheme: "dark",
        flat: true,
        class:
          "text-white before:border-white/15 before:bg-white/5 hover:before:bg-white/10 aria-expanded:before:bg-white/10",
      },
      {
        variant: "secondary",
        scheme: "light",
        flat: true,
        class:
          "text-neutral-900 before:bg-neutral-100 hover:before:bg-neutral-200/70 aria-expanded:before:bg-neutral-100",
      },
      {
        variant: "secondary",
        scheme: "dark",
        flat: true,
        class:
          "text-white before:bg-white/10 hover:before:bg-white/15 aria-expanded:before:bg-white/10",
      },
      {
        variant: "destructive",
        flat: true,
        class: "text-white before:bg-red-600 hover:before:bg-red-600/90",
      },

      {
        variant: "ghost",
        scheme: "light",
        class:
          "text-neutral-900 hover:before:bg-black/7 aria-expanded:before:bg-black/7 active:not-aria-[haspopup]:before:bg-black/12 data-pressed:before:bg-black/12",
      },
      {
        variant: "ghost",
        scheme: "dark",
        class:
          "text-white hover:before:bg-white/7 aria-expanded:before:bg-white/7 active:not-aria-[haspopup]:before:bg-white/12 data-pressed:before:bg-white/12",
      },
      { variant: "link", scheme: "light", class: "text-neutral-900" },
      { variant: "link", scheme: "dark", class: "text-white" },
      {
        variant: "push",
        scheme: "light",
        class:
          "text-neutral-900 before:bg-white hover:before:bg-neutral-100 aria-expanded:before:bg-neutral-100 [--push-face:color-mix(in_oklch,var(--color-neutral-200),black_6%)] [--push-cast:rgb(0_0_0/0.08)] [--push-sheen:rgb(255_255_255/0.16)]",
      },
      {
        variant: "push",
        scheme: "dark",
        class:
          "text-white before:bg-neutral-800 hover:before:bg-neutral-700 aria-expanded:before:bg-neutral-800 [--push-face:color-mix(in_oklch,var(--color-neutral-800),black_38%)] [--push-cast:rgb(0_0_0/0.5)] [--push-sheen:rgb(255_255_255/0.28)]",
      },

      {
        rounded: true,
        size: "xs",
        class:
          "px-3 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
      },
      {
        rounded: true,
        size: "sm",
        class:
          "px-3.5 has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5",
      },
      {
        rounded: true,
        size: "default",
        class:
          "px-3.5 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3",
      },
      {
        rounded: true,
        size: "lg",
        class:
          "px-5 has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4",
      },
    ],
    defaultVariants: {
      variant: "default",
      scheme: "light",
      size: "default",
      rounded: false,
      flat: false,
    },
  },
);

const buttonVariants = (props?: Parameters<typeof buttonStyles>[0]) =>
  cn(buttonStyles(props));

const SOFT_EDGE =
  "[--surface-edge-top:rgb(255_255_255/0)] [--surface-edge-mid:rgb(255_255_255/0)] [--surface-drop-near:rgb(0_0_0/0.04)] [--surface-drop:rgb(0_0_0/0.05)]";

const badgeStyles = cva(
  cn(
    "relative isolate inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:border before:border-transparent [&_svg]:size-3 [&_svg]:shrink-0",
    SURFACE,
    NO_SHEEN,
    SOFT_EDGE,
  ),
  {
    variants: {
      tone: {
        success:
          "text-emerald-800 [--surface-base:#e7f4ea] [--surface-lit:#daeedf] [--surface-edge-bottom:rgb(2_135_68/0.14)] [--surface-ring:rgb(2_135_68/0.22)]",
        warning:
          "text-amber-800 [--surface-base:#fef3dc] [--surface-lit:#fcebc9] [--surface-edge-bottom:rgb(217_119_6/0.16)] [--surface-ring:rgb(217_119_6/0.26)]",
        info: "text-blue-700 [--surface-base:#e8f1fe] [--surface-lit:#dde9fd] [--surface-edge-bottom:rgb(37_99_235/0.14)] [--surface-ring:rgb(37_99_235/0.22)]",
        danger:
          "text-red-700 [--surface-base:#feebe9] [--surface-lit:#fce1de] [--surface-edge-bottom:rgb(209_16_37/0.14)] [--surface-ring:rgb(209_16_37/0.22)]",
      },
    },
    defaultVariants: { tone: "success" },
  },
);

const badgeVariants = (props?: Parameters<typeof badgeStyles>[0]) =>
  cn(badgeStyles(props));

const CALM = { from: 160, to: 480, least: 0.4 } as const;
export const surfaceCalm = (length: number) =>
  Math.max(
    CALM.least,
    Math.min(
      1,
      1 - ((length - CALM.from) / (CALM.to - CALM.from)) * (1 - CALM.least),
    ),
  );

let lengths: ResizeObserver | undefined;
function measureLength(element: HTMLElement) {
  lengths ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const length =
        entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      (entry.target as HTMLElement).style.setProperty(
        "--surface-calm",
        surfaceCalm(length).toFixed(3),
      );
    }
  });
  lengths.observe(element);
  return () => lengths?.unobserve(element);
}

type ButtonVariantProps = VariantProps<typeof buttonStyles>;

type ButtonProps = ButtonVariantProps &
  (
    | ({ href: string } & Omit<ComponentProps<"a">, "href">)
    | ({ href?: undefined } & ComponentProps<"button">)
  );

function Button({
  className,
  variant = "default",
  scheme = "light",
  size = "default",
  rounded = false,
  flat = false,
  ref,
  ...props
}: ButtonProps) {
  const raised =
    (RAISED as readonly string[]).includes(variant ?? "default") && !flat;

  const attach = useCallback(
    (element: HTMLElement | null) => {
      const assign = (value: HTMLElement | null) => {
        const target = ref as Ref<HTMLElement> | undefined;
        if (typeof target === "function") target(value);
        else if (target)
          (target as { current: HTMLElement | null }).current = value;
      };
      assign(element);
      const stop = element && raised ? measureLength(element) : undefined;
      return () => {
        stop?.();
        element?.style.removeProperty("--surface-calm");
        assign(null);
      };
    },
    [ref, raised],
  );

  const shared = {
    "data-slot": "button",
    "data-variant": variant,
    className: cn(
      buttonVariants({ variant, scheme, size, rounded, flat }),
      className,
    ),
  };

  if (props.href !== undefined) {
    return <a ref={attach} {...shared} {...(props as ComponentProps<"a">)} />;
  }
  const { type = "button", ...rest } = props as ComponentProps<"button">;
  return <button ref={attach} type={type} {...shared} {...rest} />;
}

export { Button, buttonVariants, badgeVariants };
