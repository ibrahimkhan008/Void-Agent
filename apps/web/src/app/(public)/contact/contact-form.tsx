"use client";

import { cn } from "lib/utils";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CircleHelp,
  Clock,
  Copy,
  Send,
  Shield,
  ShieldAlert,
  Building2,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const TOPICS = [
  {
    id: "Support",
    label: "Product & Account Support",
    sla: "1-2 business days",
    mailbox: "support@Void Agent.local",
  },
  {
    id: "Sales",
    label: "Enterprise & Sales",
    sla: "1-2 business days",
    mailbox: "sales@Void Agent.local",
  },
  {
    id: "Security",
    label: "Security & Vulnerability",
    sla: "3 business days",
    mailbox: "security@Void Agent.local",
  },
  {
    id: "Data Request",
    label: "Privacy & Data Rights",
    sla: "7 days acknowledgment",
    mailbox: "privacy@Void Agent.local",
  },
  {
    id: "Billing",
    label: "Billing & Invoicing",
    sla: "48 hours",
    mailbox: "support@Void Agent.local",
  },
  {
    id: "Partnerships",
    label: "Partnerships & Media",
    sla: "2-3 business days",
    mailbox: "support@Void Agent.local",
  },
];

const EMAIL_CARDS = [
  {
    icon: CircleHelp,
    title: "Product & Account Support",
    sla: "SLA: 1-2 business days",
    body: "Assistance with workspace accounts, bug reports, model behaviors, and features.",
    email: "support@Void Agent.local",
    subject: "[Support]",
  },
  {
    icon: Building2,
    title: "Enterprise & Sales",
    sla: "SLA: 1-2 business days",
    body: "Custom volume quotas, dedicated microVM clusters, invoicing, and procurement paperwork.",
    email: "sales@Void Agent.local",
    subject: "[Sales]",
  },
  {
    icon: ShieldAlert,
    title: "Security & Vulnerability",
    sla: "SLA: 3 business days",
    body: "Coordinated vulnerability disclosure, penetration testing inquiries, and compliance reports.",
    email: "security@Void Agent.local",
    subject: "[Security]",
  },
  {
    icon: Shield,
    title: "Privacy & Data Rights",
    sla: "SLA: 7 days acknowledgment",
    body: "Data access, correction, deletion, and India DPDP Act compliance requests.",
    email: "privacy@Void Agent.local",
    subject: "[Data Request]",
  },
  {
    icon: MessageSquare,
    title: "Billing & Invoicing",
    sla: "SLA: 48 hours",
    body: "Subscription upgrades, payment method issues, invoice receipts, and refund claims.",
    email: "support@Void Agent.local",
    subject: "[Billing]",
  },
];

export function ContactForm() {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [copied, setCopied] = useState<string | null>(null);

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(`[${topic.id}] Inquiry from website`);
    return `mailto:${topic.mailbox}?subject=${subject}`;
  }, [topic]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    const subject = encodeURIComponent(
      `[${topic.id}] ${data.get("subject") || "Inquiry from website"}`,
    );
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nEmail: ${data.get("email")}\n\n${data.get("message")}`,
    );
    window.location.href = `mailto:${topic.mailbox}?subject=${subject}&body=${body}`;
    toast.success("Opening your mail app with the message pre-filled.");
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      toast.success(`${email} copied to clipboard.`);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  return (
    <div className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-12">
        {/* Form card */}
        <div className="lg:col-span-7">
          <div className="rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
            <div className="rounded-[16px] bg-white p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-medium tracking-tight text-(--paper)">
                  Send a Message
                </h2>
                <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 font-mono text-[10px] tracking-[0.1em] text-emerald-700 sm:flex">
                  <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                  ALL SYSTEMS OPERATIONAL
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-(--paper)/45 uppercase">
                DIRECT DISPATCH // ROUTED IN 1 ROUND-TRIP
              </p>

              <form onSubmit={submit} className="mt-8 space-y-6">
                {/* Topic */}
                <div>
                  <p className="text-sm font-medium text-(--paper)">
                    1. Select Topic / Department
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {TOPICS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTopic(t)}
                        className={cn(
                          "rounded-xl border px-3.5 py-3 text-left transition-colors",
                          topic.id === t.id
                            ? "border-(--brand)/40 bg-(--brand)/[0.06] ring-(--brand)/30"
                            : "border-black/[0.1] hover:bg-(--ink-2)",
                        )}
                      >
                        <p className="text-sm font-medium text-(--paper)">
                          {t.label}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-(--paper)/50">
                          <Clock className="size-3" />
                          {t.sla}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name + email */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-(--paper)">
                      Your Name *
                    </span>
                    <input
                      required
                      name="name"
                      type="text"
                      placeholder="Ada Lovelace"
                      className="h-10 rounded-lg border border-black/[0.12] bg-white px-3 text-(--paper) outline-none placeholder:text-(--paper)/40 focus-visible:ring-2 focus-visible:ring-(--paper)/25"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-(--paper)">
                      Work Email *
                    </span>
                    <input
                      required
                      name="email"
                      type="email"
                      placeholder="ada@company.com"
                      className="h-10 rounded-lg border border-black/[0.12] bg-white px-3 text-(--paper) outline-none placeholder:text-(--paper)/40 focus-visible:ring-2 focus-visible:ring-(--paper)/25"
                    />
                  </label>
                </div>

                {/* Subject */}
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-(--paper)">Subject</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs text-(--paper)/50">
                      [{topic.id}]
                    </span>
                    <input
                      name="subject"
                      type="text"
                      placeholder="Brief overview of your inquiry..."
                      className="h-10 w-full rounded-lg border border-black/[0.12] bg-white pr-3 pl-[110px] text-(--paper) outline-none placeholder:text-(--paper)/40 focus-visible:ring-2 focus-visible:ring-(--paper)/25"
                    />
                  </span>
                </label>

                {/* Message */}
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-(--paper)">
                    Message Details *
                  </span>
                  <textarea
                    required
                    name="message"
                    rows={5}
                    resize-none
                    placeholder={`Please provide context, steps to reproduce, or requirements so our ${topic.label} team can help in one response...`}
                    className="rounded-lg border border-black/[0.12] bg-white px-3 py-2.5 text-(--paper) outline-none placeholder:text-(--paper)/40 focus-visible:ring-2 focus-visible:ring-(--paper)/25"
                  />
                </label>

                {/* Footer row */}
                <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-5">
                  <p className="font-mono text-xs text-(--paper)/55">
                    Target mailbox:{" "}
                    <span className="font-bold text-(--paper)">
                      {topic.mailbox}
                    </span>
                  </p>
                  <a
                    href={mailto}
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-(--paper)/55 transition-colors hover:text-(--paper)"
                  >
                    Open Mail App
                    <ArrowUpRight className="size-3.5" />
                  </a>
                  <button
                    type="submit"
                    className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b7a3f] px-5 text-sm font-medium text-white transition-colors hover:bg-[#096634]"
                  >
                    <Send className="size-4" />
                    Send Message
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:col-span-5">
          {/* Email channels */}
          <div>
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/55 uppercase">
              DIRECT EMAIL CHANNELS
            </h3>
            <div className="mt-4 space-y-3">
              {EMAIL_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="group rounded-2xl border border-black/[0.07] bg-white/70 p-4 backdrop-blur-xs transition-all hover:border-black/20 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-(--ink) text-(--brand)">
                      <card.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium text-(--paper)">
                          {card.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => copyEmail(card.email)}
                          title={`Copy ${card.email}`}
                          aria-label={`Copy ${card.email}`}
                          className="text-(--paper)/45 transition-colors hover:text-(--paper)"
                        >
                          <Copy
                            className={cn(
                              "size-3.5",
                              copied === card.email && "text-(--brand)",
                            )}
                          />
                        </button>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-black/50">
                        {card.sla}
                      </p>
                      <p className="mt-1.5 text-xs/5 text-(--paper)/60">
                        {card.body}
                      </p>
                      <p className="mt-2 font-mono text-xs text-(--brand)">
                        {card.email}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-black/40">
                        Suggested subject: {card.subject}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Statutory card */}
          <div className="rounded-2xl bg-white/70 p-5 backdrop-blur-xs">
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/55 uppercase">
              STATUTORY & GRIEVANCE REDRESSAL
            </h3>
            <p className="mt-3 text-sm/6 text-(--paper)/60">
              Void Agent operates in full compliance with the Digital Personal
              Data Protection (DPDP) Act, 2023. For grievance escalation or
              statutory rights, refer to our legal center:
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {[
                ["Grievance Redressal", "/grievance-redressal"],
                ["Privacy Policy", "/privacy-policy"],
                ["Terms of Service", "/terms-of-service"],
              ].map(([label, href], i) => (
                <span key={href} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-(--paper)/30">•</span>}
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-(--brand) hover:underline"
                  >
                    {label}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </span>
              ))}
            </div>
          </div>

          {/* Community */}
          <div className="rounded-2xl bg-white/70 p-5 backdrop-blur-xs">
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-(--paper)/55 uppercase">
              COMMUNITY & CODE
            </h3>
            <div className="mt-3 space-y-2">
              {[
                [
                  "X (Twitter)",
                  "@ibrahimkhan008 ↗",
                  "https://x.com/ibrahimkhan008",
                ],
                [
                  "GitHub Repository",
                  "Void Agent ↗",
                  "https://github.com/ibrahimkhan008",
                ],
              ].map(([label, display, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-(--ink-2)"
                >
                  <span className="text-(--paper)/70">{label}</span>
                  <span className="font-medium text-(--paper)">{display}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
