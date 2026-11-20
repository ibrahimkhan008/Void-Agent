"use client";

import { Button, EASE, Section } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import {
  type Icon,
  IconCalendar,
  IconCheck,
  IconCpu,
  IconDatabase,
  IconMessage2,
  IconPhoto,
  IconRocket,
} from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { APP_URL, MARKETING_URL } from "lib/site";
import { Loader2 } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useId,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

type Billing = "monthly" | "annual";

type Plan = {
  id: string;
  name: string;
  blurb: string;
  price: Record<Billing, string>;
  unit: Record<Billing, string>;
  save?: string;
  pill?: { label: string; annualOnly?: boolean };
  intro: string;
  features: { icon: Icon; label: string }[];
  cta: {
    label: string;
    href?: string;
    variant: "default" | "secondary" | "outline";
  };
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "For trying Void Agent and everyday questions.",
    price: { monthly: "Free", annual: "Free" },
    unit: { monthly: "No credit card needed", annual: "No credit card needed" },
    intro: "Includes:",
    features: [
      { icon: IconMessage2, label: "400K AI tokens a week" },
      { icon: IconRocket, label: "1 Cloud Agent launch a week" },
      { icon: IconCpu, label: "1 sandbox CPU hour a week" },
      { icon: IconPhoto, label: "5 image generations a week" },
      { icon: IconCalendar, label: "8 scheduled runs a week" },
      { icon: IconDatabase, label: "1 GB of storage" },
    ],
    cta: { label: "Start for free", variant: "outline" },
  },
  {
    id: "plus",
    name: "Plus",
    blurb: "For individual builders, creators and daily AI work.",
    price: { monthly: "$10", annual: "$8.33" },
    unit: {
      monthly: "per month, billed monthly",
      annual: "per month, billed $100 yearly",
    },
    save: "2 months free",
    intro: "More of everything in Free:",
    features: [
      { icon: IconMessage2, label: "2.5M AI tokens a week" },
      { icon: IconRocket, label: "5 Cloud Agent launches a week" },
      { icon: IconCpu, label: "2 sandbox CPU hours a week" },
      { icon: IconPhoto, label: "25 image generations a week" },
      { icon: IconCalendar, label: "75 scheduled runs a week" },
      { icon: IconDatabase, label: "10 GB of storage" },
    ],
    cta: { label: "Choose Plus", variant: "secondary" },
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For developers shipping full-stack apps with agents.",
    price: { monthly: "$25", annual: "$20.83" },
    unit: {
      monthly: "per month, billed monthly",
      annual: "per month, billed $250 yearly",
    },
    pill: { label: "Most popular" },
    intro: "More of everything in Plus:",
    features: [
      { icon: IconMessage2, label: "4.5M AI tokens a week" },
      { icon: IconRocket, label: "15 Cloud Agent launches a week" },
      { icon: IconCpu, label: "4 sandbox CPU hours a week" },
      { icon: IconPhoto, label: "75 image generations a week" },
      { icon: IconCalendar, label: "250 scheduled runs a week" },
      { icon: IconDatabase, label: "50 GB of storage" },
    ],
    cta: { label: "Get started", variant: "default" },
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "For heavy engineering and production workflows.",
    price: { monthly: "$60", annual: "$50" },
    unit: {
      monthly: "per month, billed monthly",
      annual: "per month, billed $600 yearly",
    },
    save: "2 months free",
    intro: "More of everything in Pro:",
    features: [
      { icon: IconMessage2, label: "10M AI tokens a week" },
      { icon: IconRocket, label: "50 Cloud Agent launches a week" },
      { icon: IconCpu, label: "13 sandbox CPU hours a week" },
      { icon: IconPhoto, label: "200 image generations a week" },
      { icon: IconCalendar, label: "1,250 scheduled runs a week" },
      { icon: IconDatabase, label: "200 GB of storage" },
    ],
    cta: { label: "Choose Scale", variant: "outline" },
  },
];

type Cell = boolean | string;

const COMPARISON: {
  group: string;
  rows: { label: string; values: [Cell, Cell, Cell, Cell] }[];
}[] = [
  {
    group: "Weekly quotas",
    rows: [
      { label: "AI tokens a week", values: ["400K", "2.5M", "4.5M", "10M"] },
      { label: "Cloud Agent launches a week", values: ["1", "5", "15", "50"] },
      { label: "Sandbox CPU hours a week", values: ["1", "2", "4", "13"] },
      { label: "Image generations a week", values: ["5", "25", "75", "200"] },
      { label: "Scheduled runs a week", values: ["8", "75", "250", "1,250"] },
      { label: "Storage", values: ["1 GB", "10 GB", "50 GB", "200 GB"] },
    ],
  },
  {
    group: "Models & agents",
    rows: [
      { label: "Models in the catalog", values: ["30+", "30+", "30+", "30+"] },
      { label: "Switch models mid-thread", values: [true, true, true, true] },
      { label: "Automatic model fallback", values: [true, true, true, true] },
      { label: "MCP servers", values: [true, true, true, true] },
      { label: "Custom agents", values: [true, true, true, true] },
      { label: "Public gallery & forking", values: [true, true, true, true] },
    ],
  },
];

const OUTER =
  "rounded-[20px] bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]";
const INNER_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]";

export function Pricing() {
  const reduceMotion = !!useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [billing, setBilling] = useState<Billing>("annual");
  const [mobilePlan, setMobilePlan] = useState(
    PLANS.findIndex((plan) => plan.highlight),
  );
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [, startCheckout] = useTransition();

  // Same checkout flow as the /pricing page: POST to the product app with the
  // Lax session cookie; a 401 sends the user to sign-in and brings them back
  // to /pricing with the plan and billing cycle restored.
  const handleCheckout = (plan: Plan) => {
    setPendingTier(plan.id);
    startCheckout(async () => {
      try {
        const res = await fetch(`${APP_URL}/api/payments/dodo/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tier: plan.id }),
        });
        if (res.status === 401) {
          const returnTo = `${MARKETING_URL}/pricing?plan=${encodeURIComponent(plan.id)}&billing=${billing}&retry=1`;
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

  return (
    <Section
      id="pricing"
      labelledBy={`${id}-heading`}
      className="py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center text-center">
          <h2
            id={`${id}-heading`}
            className="text-5xl font-medium tracking-tight sm:text-6xl"
          >
            Pricing
          </h2>
          <p className="mt-5 max-w-[44ch] text-lg text-pretty text-(--paper)/60">
            Start free, upgrade when your agents need more room, and get two
            months free when you pay yearly.
          </p>
          <BillingToggle
            billing={billing}
            onChange={setBilling}
            reduceMotion={reduceMotion}
          />
        </div>

        <div
          className={cn(
            OUTER,
            "mt-14 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              billing={billing}
              reduceMotion={reduceMotion}
              pending={pendingTier === plan.id}
              onCheckout={handleCheckout}
            />
          ))}
        </div>

        <div className="relative mt-16 md:mt-10 md:overflow-x-auto">
          <div
            role="radiogroup"
            aria-label="Plan to compare"
            className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06] md:hidden"
          >
            {PLANS.map((plan, i) => (
              <button
                key={plan.name}
                type="button"
                role="radio"
                aria-checked={mobilePlan === i}
                onClick={() => setMobilePlan(i)}
                className={cn(
                  "relative h-10 rounded-lg text-[13px] font-medium transition-colors sm:text-sm duration-150 focus-visible:outline-2 focus-visible:outline-(--paper)",
                  mobilePlan === i ? "text-(--paper)" : "text-(--paper)/50",
                )}
              >
                {mobilePlan === i && (
                  <motion.span
                    layoutId={`${id}-compare`}
                    className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", bounce: 0.15, duration: 0.4 }
                    }
                  />
                )}
                <span className="relative">{plan.name}</span>
              </button>
            ))}
          </div>
          <table className="w-full text-left text-base md:min-w-[720px] md:text-sm">
            <caption className="sr-only">
              Features in each Void Agent plan
            </caption>
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th
                  scope="col"
                  className="w-1/2 px-4 py-5 font-normal text-(--paper)/45 md:w-[28%] md:px-5"
                >
                  Features
                </th>
                {PLANS.map((plan, i) => (
                  <th
                    key={plan.name}
                    scope="col"
                    className={cn(
                      "px-4 py-5 align-bottom whitespace-nowrap md:px-5",
                      plan.highlight && "bg-white/[0.03]",
                      i !== mobilePlan && "max-md:hidden",
                    )}
                  >
                    <span className="block font-medium text-(--paper)">
                      {plan.name}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-(--paper)/45 tabular-nums">
                      <RollingNumber
                        value={plan.price[billing]}
                        reduceMotion={reduceMotion}
                      />
                      {plan.price[billing].startsWith("$") &&
                        ` ${plan.unit[billing].split(",")[0]}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <Fragment key={group.group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={5}
                      className="px-4 pt-7 pb-2 text-sm font-medium tracking-wide text-(--brand) md:px-5 md:text-xs"
                    >
                      {group.group}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr
                      key={row.label}
                      className="border-t border-white/[0.05]"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3.5 font-normal text-(--paper)/70 md:px-5"
                      >
                        {row.label}
                      </th>
                      {row.values.map((value, i) => (
                        <td
                          key={i}
                          className={cn(
                            "px-4 py-3.5 tabular-nums md:px-5",
                            PLANS[i].highlight && "bg-white/[0.03]",
                            i !== mobilePlan && "max-md:hidden",
                          )}
                        >
                          <CellValue value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function BillingToggle({
  billing,
  onChange,
  reduceMotion,
}: {
  billing: Billing;
  onChange: (billing: Billing) => void;
  reduceMotion: boolean;
}) {
  const id = useId();
  const options: { value: Billing; label: ReactNode }[] = [
    { value: "monthly", label: "Monthly" },
    {
      value: "annual",
      label: (
        <>
          Annual
          <span className="rounded-full bg-(--brand)/15 px-1.5 py-0.5 text-[11px] font-medium text-(--brand)">
            2 months free
          </span>
        </>
      ),
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="mt-10 inline-flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.06]"
    >
      {options.map((option) => {
        const selected = billing === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)",
              selected
                ? "text-(--paper)"
                : "text-(--paper)/50 hover:text-(--paper)/80",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-billing`}
                className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/10"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", bounce: 0.15, duration: 0.4 }
                }
              />
            )}
            <span className="relative flex items-center gap-2">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function RollingNumber({
  value,
  reduceMotion,
}: { value: string; reduceMotion: boolean }) {
  const chars = value.split("");
  return (
    <span className="relative inline-flex leading-none">
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((char, i) => {
          const key = chars.length - i;
          const digit = DIGITS.indexOf(char);
          if (digit === -1) {
            return (
              <span key={`${key}-${char}`} className="inline-block">
                {char}
              </span>
            );
          }
          return (
            <span
              key={key}
              className="relative inline-block h-[1em] overflow-hidden"
            >
              <span className="invisible">0</span>
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                initial={false}
                animate={{ y: `${-digit * 10}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: 140,
                        damping: 20,
                        mass: 0.8,
                        delay: (chars.length - 1 - i) * 0.04,
                      }
                }
              >
                {DIGITS.map((d) => (
                  <span key={d} className="block h-[1em]">
                    {d}
                  </span>
                ))}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

function PriceSwap({
  value,
  reduceMotion,
}: { value: string; reduceMotion: boolean }) {
  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="col-start-1 row-start-1"
          initial={{
            opacity: 0,
            filter: reduceMotion ? "blur(0px)" : "blur(3px)",
          }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{
            opacity: 0,
            filter: reduceMotion ? "blur(0px)" : "blur(3px)",
          }}
          transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function PlanCard({
  plan,
  billing,
  reduceMotion,
  pending,
  onCheckout,
}: {
  plan: Plan;
  billing: Billing;
  reduceMotion: boolean;
  pending: boolean;
  onCheckout: (plan: Plan) => void;
}) {
  const showSave = plan.save && billing === "annual";
  const showPill = plan.pill && (billing === "annual" || !plan.pill.annualOnly);

  return (
    <div
      className={cn(
        "flex flex-col rounded-[14px]",
        plan.highlight && "bg-white/[0.04]",
      )}
    >
      <div
        className={cn(
          "rounded-[14px] p-5",
          plan.highlight ? "bg-[#161616]" : "bg-[#0a0a0a]",
          INNER_SHADOW,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-medium">{plan.name}</h3>
          <AnimatePresence initial={false}>
            {showPill && (
              <motion.span
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="rounded-full bg-(--brand)/15 px-2 py-0.5 text-[11px] font-medium text-(--brand)"
              >
                {plan.pill?.label}
              </motion.span>
            )}
            {showSave && (
              <motion.span
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="rounded-full bg-(--brand)/15 px-2 py-0.5 text-[11px] font-medium text-(--brand)"
              >
                {plan.save}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-1.5 min-h-10 text-sm text-pretty text-(--paper)/50">
          {plan.blurb}
        </p>
        <p className="mt-6 text-4xl font-medium tracking-tight tabular-nums">
          <RollingNumber
            value={plan.price[billing]}
            reduceMotion={reduceMotion}
          />
        </p>
        <p className="mt-1.5 min-h-10 text-sm text-(--paper)/45">
          <PriceSwap value={plan.unit[billing]} reduceMotion={reduceMotion} />
        </p>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-5 pb-4">
        <p className="text-sm text-(--paper)/55">{plan.intro}</p>
        <ul role="list" className="mt-3 flex-1 space-y-2.5">
          {plan.features.map((feature) => (
            <li
              key={feature.label}
              className="flex items-center gap-2.5 text-sm text-(--paper)/75"
            >
              <feature.icon
                className="size-4 shrink-0 text-(--paper)/40"
                stroke={1.6}
                aria-hidden
              />
              {feature.label}
            </li>
          ))}
        </ul>
        {plan.cta.href ? (
          <Button
            href={plan.cta.href}
            variant={plan.cta.variant}
            scheme="dark"
            size="lg"
            className="mt-5 w-full"
          >
            {plan.cta.label}
          </Button>
        ) : (
          <Button
            variant={plan.cta.variant}
            scheme="dark"
            size="lg"
            disabled={pending}
            aria-busy={pending}
            onClick={() => onCheckout(plan)}
            className="mt-5 w-full"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {plan.cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <IconCheck
          className="size-4 text-(--brand)"
          stroke={2.25}
          aria-hidden
        />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span className="block h-px w-3 bg-white/20" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-(--paper)/80">{value}</span>;
}
