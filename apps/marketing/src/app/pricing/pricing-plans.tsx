"use client";

import { Button } from "@/components/landing/ui";
import { AnimatePresence, motion } from "framer-motion";
import { APP_URL, MARKETING_URL } from "lib/site";
import { cn } from "lib/utils";
import {
  Bot,
  CalendarClock,
  Cpu,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

type BillingInterval = "monthly" | "annual";

interface Plan {
  id: string;
  name: string;
  blurb: string;
  priceAnnual: string;
  priceMonthly: string;
  annualPerMonth: number;
  noteAnnual: string;
  noteMonthly: string;
  intro: string;
  features: string[];
  highlight?: boolean;
  badge?: { label: string; annualOnly?: boolean };
  cta: {
    label: string;
    href?: string;
    variant: "outline" | "secondary" | "default";
  };
  banner: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "For trying Void Agent and everyday questions.",
    priceAnnual: "Free",
    priceMonthly: "Free",
    annualPerMonth: 0,
    noteAnnual: "No credit card needed",
    noteMonthly: "No credit card needed",
    intro: "Includes:",
    features: [
      "400K AI tokens a week",
      "1 Cloud Agent launch a week",
      "1 sandbox CPU hour a week",
      "5 image generations a week",
      "8 scheduled runs a week",
      "1 GB of storage",
    ],
    cta: { label: "Start for free", href: "/sign-up", variant: "outline" },
    banner: "/images/dither-plan-1.png",
  },
  {
    id: "plus",
    name: "Plus",
    blurb: "For individual builders, creators and daily AI work.",
    priceAnnual: "$8.33",
    priceMonthly: "$10",
    annualPerMonth: 8.33,
    noteAnnual: "per month, billed $100 yearly",
    noteMonthly: "per month, billed monthly",
    intro: "More of everything in Free:",
    features: [
      "2.5M AI tokens a week",
      "5 Cloud Agent launches a week",
      "2 sandbox CPU hours a week",
      "25 image generations a week",
      "75 scheduled runs a week",
      "10 GB of storage",
    ],
    badge: { label: "2 months free", annualOnly: true },
    cta: { label: "Choose Plus", variant: "secondary" },
    banner: "/images/dither-plan-2.png",
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For developers shipping full-stack apps with agents.",
    priceAnnual: "$20.83",
    priceMonthly: "$25",
    annualPerMonth: 20.83,
    noteAnnual: "per month, billed $250 yearly",
    noteMonthly: "per month, billed monthly",
    intro: "More of everything in Plus:",
    features: [
      "4.5M AI tokens a week",
      "15 Cloud Agent launches a week",
      "4 sandbox CPU hours a week",
      "75 image generations a week",
      "250 scheduled runs a week",
      "50 GB of storage",
    ],
    highlight: true,
    badge: { label: "Most popular" },
    cta: { label: "Get started", variant: "default" },
    banner: "/images/dither-plan-3.png",
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "For heavy engineering and production workflows.",
    priceAnnual: "$50",
    priceMonthly: "$60",
    annualPerMonth: 50,
    noteAnnual: "per month, billed $600 yearly",
    noteMonthly: "per month, billed monthly",
    intro: "More of everything in Pro:",
    features: [
      "10M AI tokens a week",
      "50 Cloud Agent launches a week",
      "13 sandbox CPU hours a week",
      "200 image generations a week",
      "1,250 scheduled runs a week",
      "200 GB of storage",
    ],
    badge: { label: "2 months free", annualOnly: true },
    cta: { label: "Choose Scale", variant: "outline" },
    banner: "/images/dither-plan-4.png",
  },
];

const FEATURE_ICONS = [
  MessageSquare,
  Bot,
  Cpu,
  ImageIcon,
  CalendarClock,
  HardDrive,
] as const;

/** Two-column sliding price: digits translate vertically on billing change. */
function PlanPrice({
  plan,
  interval,
}: {
  plan: Plan;
  interval: BillingInterval;
}) {
  const price = interval === "annual" ? plan.priceAnnual : plan.priceMonthly;
  return (
    <p
      className="mt-6 text-4xl font-medium tracking-tight tabular-nums text-(--paper)"
      aria-label={`${price} per month`}
    >
      {/* Swapped prices crossfade with a short blur (design.md motion rule). */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={price}
          aria-hidden
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="inline-block"
        >
          {price}
        </motion.span>
      </AnimatePresence>
    </p>
  );
}

export function PricingPlans({
  initialPlan,
  initialBilling,
  autoRetry,
}: {
  /** Restored checkout intent: plan id carried back from sign-in. */
  initialPlan?: string;
  initialBilling?: BillingInterval;
  /** When true, re-attempt checkout once on mount — the user just signed in
      after a 401 and must not have to pick their plan again. */
  autoRetry?: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>(
    initialBilling ?? "annual",
  );
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [checkoutPending, startCheckout] = useTransition();
  const autoRetryDone = useRef(false);

  const handleCheckout = (plan: Plan) => {
    if (plan.id === "free" || plan.cta.href) {
      return;
    }
    setPendingTier(plan.id);
    startCheckout(async () => {
      try {
        // Cross-origin POST to the product app. voidagent.space and
        // app.voidagent.space share the registrable domain, so the Lax
        // session cookie rides along with credentials: "include"; the
        // endpoint answers with an exact-origin CORS allowlist.
        const res = await fetch(`${APP_URL}/api/payments/dodo/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tier: plan.id }),
        });
        if (res.status === 401) {
          // Preserve the full checkout intent across sign-in: the user
          // returns to /pricing?plan=<id>&billing=<cycle>&retry=1 and the
          // selected plan is re-attempted automatically (effect below).
          const returnTo = `${MARKETING_URL}/pricing?plan=${encodeURIComponent(plan.id)}&billing=${interval}&retry=1`;
          window.location.href = `${APP_URL}/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`;
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          redirectUrl?: string;
          checkoutUrl?: string;
        };
        const url = data.redirectUrl ?? data.checkoutUrl;
        if (url) {
          window.location.href = url;
          return;
        }
        throw new Error();
      } catch {
        toast.error("Unable to start checkout.");
      } finally {
        setPendingTier(null);
      }
    });
  };

  // Post-sign-in continuation: restore the billing cycle the user had and
  // retry their selected plan exactly once. The intent params are stripped
  // FIRST (history.replaceState), so a second 401 can never loop.
  useEffect(() => {
    if (!autoRetry || autoRetryDone.current) return;
    autoRetryDone.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    const plan = PLANS.find(
      (p) => p.id === initialPlan && p.id !== "free" && !p.cta.href,
    );
    if (plan) handleCheckout(plan);
    // handleCheckout closes over the mount-time `interval`, which is exactly
    // the restored cycle (initialBilling) — no dependency needed.
  }, [autoRetry, initialPlan]);

  return (
    <>
      {/* Billing toggle (§4.4 radiogroup) */}
      <div className="mt-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex rounded-full border border-white/[0.08] bg-(--ink-2) p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.5)]"
        >
          {(
            [
              { id: "monthly", label: "Monthly" },
              { id: "annual", label: "Annual" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={interval === option.id}
              onClick={() => setInterval(option.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                interval === option.id
                  ? "bg-(--paper) text-(--ink) shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.5)]"
                  : "text-(--paper)/60 hover:text-(--paper)",
              )}
            >
              {option.label}
              {option.id === "annual" && (
                <span className="rounded-md bg-(--brand)/10 px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] text-(--brand) uppercase">
                  2 months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plans tray */}
      <div
        aria-label="Plans"
        className="mx-auto mt-14 max-w-7xl px-6 pt-14 pb-24 sm:pb-32"
      >
        <div className="grid gap-1.5 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(255,255,255,0.06),0_24px_60px_-36px_rgba(0,0,0,0.8)] sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-[14px]",
                plan.highlight && "bg-(--brand)/[0.06]",
              )}
            >
              {/* Top block */}
              <div
                className={cn(
                  "p-5 bg-[#0a0a0a] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.5),0_8px_20px_-12px_rgba(0,0,0,0.6)] rounded-[14px]",
                  plan.highlight && "ring-(--brand)/30",
                )}
              >
                <div className="-mx-5 -mt-5 mb-5 h-24 overflow-hidden rounded-t-[14px]">
                  <Image
                    src={plan.banner}
                    alt=""
                    width={400}
                    height={96}
                    className="h-24 w-full object-cover invert [image-rendering:pixelated]"
                  />
                  <div className="bg-linear-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />
                </div>
                <div className="flex min-h-6 items-center">
                  {plan.badge &&
                    (!plan.badge.annualOnly || interval === "annual") && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium",
                          plan.highlight
                            ? "bg-(--paper) text-(--ink)"
                            : "bg-(--brand)/10 text-(--brand)",
                        )}
                      >
                        {plan.badge.label}
                      </span>
                    )}
                </div>
                <p className="mt-1 text-base font-medium text-(--paper)">
                  {plan.name}
                </p>
                <p className="mt-1.5 min-h-10 text-sm text-(--paper)/55">
                  {plan.blurb}
                </p>
                <PlanPrice plan={plan} interval={interval} />
                <p className="mt-1.5 min-h-10 text-sm text-(--paper)/50">
                  {interval === "annual" ? plan.noteAnnual : plan.noteMonthly}
                </p>
              </div>

              {/* Bottom block */}
              <div className="flex flex-1 flex-col px-4 pt-5 pb-4">
                <p className="text-sm text-(--paper)/55">{plan.intro}</p>
                <ul className="mt-3 flex-1 space-y-2.5">
                  {plan.features.map((feature, i) => {
                    const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
                    return (
                      <li
                        key={feature}
                        className="flex items-center gap-2.5 text-sm text-(--paper)/75"
                      >
                        <Icon
                          className="size-4 text-(--paper)/40"
                          strokeWidth={1.6}
                        />
                        {feature}
                      </li>
                    );
                  })}
                </ul>
                {plan.cta.href ? (
                  /* Free plan (and any plan with a plain href): link into
                     the product app's sign-up flow. */
                  <Button
                    href={`${APP_URL}${plan.cta.href}`}
                    variant="outline"
                    scheme="dark"
                    className="mt-5 w-full"
                  >
                    {plan.cta.label}
                  </Button>
                ) : plan.cta.variant === "default" ? (
                  /* Pro CTA: the landing's default dark-scheme button —
                     white surface, dark text. */
                  <Button
                    variant="default"
                    scheme="dark"
                    onClick={() => handleCheckout(plan)}
                    disabled={checkoutPending}
                    aria-busy={pendingTier === plan.id}
                    className="mt-5 w-full"
                  >
                    {pendingTier === plan.id && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    {pendingTier === plan.id
                      ? "Opening checkout"
                      : plan.cta.label}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    scheme="dark"
                    onClick={() => handleCheckout(plan)}
                    disabled={checkoutPending}
                    aria-busy={pendingTier === plan.id}
                    className="mt-5 w-full"
                  >
                    {pendingTier === plan.id && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    {pendingTier === plan.id
                      ? "Opening checkout"
                      : plan.cta.label}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise strip */}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-(--ink-2) px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-(--paper)">Enterprise</p>
            <p className="text-sm text-(--paper)/55">
              Custom limits, onboarding, invoicing and dedicated support for
              your team.
            </p>
          </div>
          <Button
            href="/contact-sales"
            variant="outline"
            scheme="dark"
            rounded
            className="shrink-0"
          >
            Contact sales
          </Button>
        </div>
      </div>
    </>
  );
}
