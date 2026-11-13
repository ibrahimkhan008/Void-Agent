import type { Metadata } from "next";
import Link from "next/link";
import {
  CloudCog,
  Gauge,
  Mail,
  MessageCircle,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Sales | Void Agent",
  description:
    "Talk with Void Agent about custom capacity, deployment planning, and operational requirements.",
  alternates: { canonical: "/contact-sales" },
  openGraph: { title: "Contact Void Agent Sales" },
};

const FEATURES = [
  {
    icon: Gauge,
    title: "Plan and capacity guidance",
    body: "Match chat, image, and agent limits to your expected usage.",
  },
  {
    icon: CloudCog,
    title: "Deployment planning",
    body: "Discuss custom capacity and operational requirements.",
  },
  {
    icon: SlidersHorizontal,
    title: "Admin-controlled access",
    body: "Configure tier quotas, model availability, and global features.",
  },
  {
    icon: Workflow,
    title: "Connected workflows",
    body: "Use custom agents, visual workflows, and approved MCP connections.",
  },
];

export default function ContactSalesPage() {
  return (
    <div
      className="min-h-dvh w-full overflow-x-clip"
      style={
        {
          background: "#080808",
          "--ink": "#080808",
          "--ink-2": "#141414",
          "--paper": "#f2efe9",
          "--brand": "#4ade80",
          "--brand-glow": "#22c55e",
        } as React.CSSProperties
      }
    >
      {/* Dark-tone floating navbar */}
      <header className="fixed inset-x-3 top-3 z-100 mx-auto max-w-7xl rounded-2xl bg-[#0d0d0d]/80 backdrop-blur-xl transition-[top,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:inset-x-4 sm:top-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07)]">
        <nav
          aria-label="Main"
          className="grid h-[60px] grid-cols-[1fr_auto] items-center gap-4 pr-2.5 pl-4 md:grid-cols-[1fr_auto_1fr]"
        >
          <Link href="/" className="flex items-center gap-2.5">
            <span className="text-[17px] font-medium tracking-[-0.01em] text-white">
              Void Agent
            </span>
          </Link>
          <div className="hidden items-center rounded-xl bg-white/[0.05] p-1 md:flex">
            {[
              ["About", "/about"],
              ["Pricing", "/pricing"],
              ["Docs", "/docs"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="block rounded-lg px-3.5 py-1.5 text-[13.5px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Link
              href="/sign-in"
              className="hidden h-9 items-center rounded-[10px] border border-white/[0.15] bg-transparent px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06] sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-white px-4 text-sm font-medium text-black"
            >
              Start free
              <span aria-hidden>→</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:px-12 lg:grid lg:grid-cols-12 lg:gap-12 lg:gap-16">
        {/* Left */}
        <div className="pt-8 lg:col-span-6">
          <h1 className="text-4xl leading-[1.08] font-extrabold text-white md:text-5xl lg:text-6xl">
            Contact our
            <br />
            sales team
          </h1>
          <p className="mt-5 text-lg/8 text-zinc-400 md:text-xl/8">
            Discuss custom capacity, deployment requirements, and the right Void
            Agent plan for your workload.
          </p>

          <h2 className="mt-12 text-xs font-bold tracking-wider text-zinc-500 uppercase">
            Features
          </h2>
          <ul className="mt-6 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="grid shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-[#10b981]">
                  <f.icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="mt-1 text-sm/6 text-zinc-400">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-12 border-t border-zinc-800 pt-6 text-sm/7 text-zinc-400">
            Tell us how many users you expect, which workflows matter, and what
            capacity you need. We will map the current product to those
            requirements and identify any custom work clearly.
          </p>
        </div>

        {/* Right card */}
        <div className="mt-16 lg:col-span-6 lg:mt-0">
          <div className="relative min-h-[560px] rounded-2xl border border-zinc-800 bg-[#0c0c0e] p-6 shadow-2xl md:p-8">
            <div
              aria-hidden
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse 60% 40% at 80% 0%, rgba(16,185,129,0.08), transparent)",
              }}
            />
            <div className="relative flex h-full flex-col">
              <span className="grid size-11 place-items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                <Mail className="size-5" />
              </span>
              <h2 className="mt-6 text-2xl font-bold text-white md:text-3xl">
                Talk to Void Agent
              </h2>
              <p className="mt-4 text-sm/7 text-zinc-400">
                Send your expected user count, primary workflows, required
                models or tools, and target capacity. We will reply with the
                closest current plan and clearly scope any custom work.
              </p>
              <a
                href="mailto:support@Void Agent.local?subject=Void Agent%20sales%20inquiry"
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 font-semibold text-black transition-colors hover:bg-emerald-400"
              >
                <Mail className="size-4" />
                Email sales
              </a>

              <div className="my-8 border-t border-zinc-800" />

              <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Community channels
              </h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a
                  href="https://github.com/ibrahimkhan008"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-sm font-medium text-white transition-colors hover:bg-zinc-900"
                >
                  GitHub
                </a>
                <a
                  href="mailto:support@Void Agent.local"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-sm font-medium text-white transition-colors hover:bg-zinc-900"
                >
                  <MessageCircle className="size-4" />
                  Support
                </a>
              </div>

              <p className="mt-auto pt-10 text-xs/6 text-zinc-500">
                For account support, billing questions, or security reports, use
                the same support address and include your Void Agent account
                email.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* No footer on this page (§5.7); toast region only */}
      <div className="pb-8 text-center">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Back to Void Agent
        </Link>
      </div>
    </div>
  );
}
