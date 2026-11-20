import { PageShell } from "@/components/landing/page-shell";
import { Button } from "@/components/landing/ui";
import {
  CloudCog,
  Gauge,
  Mail,
  MessageCircle,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";

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
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:px-12 lg:grid lg:grid-cols-12 lg:gap-12 lg:gap-16">
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
                <span className="grid shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.05] p-2.5 text-(--brand)">
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
          <div className="relative min-h-[560px] rounded-2xl border border-white/[0.08] bg-[#141414] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] md:p-8">
            <div
              aria-hidden
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse 60% 40% at 80% 0%, rgba(0,153,255,0.10), transparent)",
              }}
            />
            <div className="relative flex h-full flex-col">
              <span className="grid size-11 place-items-center rounded-xl border border-(--brand)/25 bg-(--brand)/10 text-(--brand-glow)">
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
              <Button
                href="mailto:support@voidagent.space?subject=Void Agent%20sales%20inquiry"
                scheme="dark"
                size="lg"
                className="mt-8 min-h-12"
              >
                Email sales
              </Button>

              <div className="my-8 border-t border-white/[0.08]" />

              <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Community channels
              </h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a
                  href="https://github.com/ibrahimkhan008"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm font-medium text-white transition-colors hover:bg-white/[0.1]"
                >
                  GitHub
                </a>
                <a
                  href="mailto:support@voidagent.space"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm font-medium text-white transition-colors hover:bg-white/[0.1]"
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
      </div>
    </PageShell>
  );
}
