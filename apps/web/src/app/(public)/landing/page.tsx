import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { FaqAccordion } from "@/components/public/faq-accordion";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";
import { PricingPlans } from "../pricing/pricing-plans";
import {
  LandingHero,
  PartnerStrip,
  FeaturesSection,
  GetStartedSection,
} from "./landing-sections";
import { WorkflowSection, NetworkSection } from "./landing-workflow";
import { AgentsTabs } from "./agents-tabs";
import { ModelsCatalog } from "./models-catalog";

export const metadata: Metadata = {
  title: "Void Agent: Autonomous AI Agent Platform with Multi-Model Freedom",
  description:
    "Void Agent is an autonomous AI agent platform that plans, codes, and runs multi-step tasks in cloud sandboxes — plus multi-model flexibility across Claude, GPT, Gemini, Groq and DeepSeek.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Void Agent: Autonomous AI Agent Platform with Multi-Model Freedom",
    description:
      "Build full-stack web apps in sandboxes, automate workflows via MCP, and switch models across Claude, GPT, Gemini and DeepSeek.",
    type: "website",
  },
};

const FAQ_ITEMS = [
  {
    question: "What makes Void Agent different from Manus?",
    answer:
      "Void Agent is an autonomous AI agent platform like Manus that plans, codes, and runs multi-step tasks in isolated cloud sandboxes. Unlike tools that lock you into one orchestrator or model, Void Agent lets you switch between Claude, GPT, Gemini, DeepSeek and more inside the same thread, connect your own tools through MCP, and start on a free plan.",
  },
  {
    question: "How does the Void Agent Cloud Agent build full-stack web apps?",
    answer:
      "Cloud Agent starts a dedicated, isolated Linux sandbox with Node.js, Python, git and dev servers. It plans the task, writes and edits files, runs terminal commands, fixes its own errors, and gives you a live preview link in your workspace.",
  },
  {
    question: "Do Cloud Agent tasks keep running if I close the tab?",
    answer:
      "Yes. Cloud Agent runs as a background job, so you can close the tab and come back later to finished work. You can press Stop at any time.",
  },
  {
    question: "What AI models are available in Void Agent?",
    answer:
      "Void Agent gives you 30+ models from Anthropic, OpenAI, Google, Groq, Z AI and more, including the Claude, GPT, Gemini and DeepSeek families, under one account with no vendor lock-in.",
  },
  {
    question: "Can I connect my own tools?",
    answer:
      "Yes. Void Agent supports Model Context Protocol (MCP) servers, so you can connect tools like GitHub, Notion or your own APIs and choose which ones each chat or agent is allowed to use.",
  },
  {
    question: "Is there a free plan for Void Agent?",
    answer:
      "Yes. The Free plan includes weekly AI tokens for multi-model chat, image generation, document analysis and a Cloud Agent launch each week, with no credit card required.",
  },
];

export default function LandingPage() {
  return (
    <div
      className="brand-surface min-h-dvh w-full overflow-x-clip"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      <LandingHero />
      <PartnerStrip />
      <FeaturesSection />
      <WorkflowSection />
      <NetworkSection />
      <AgentsTabs />
      <ModelsCatalog />

      {/* 8. #pricing */}
      <section id="pricing" className="scroll-mt-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl lg:text-6xl">
            Simple Pricing For <AccentSpan>Every Builder.</AccentSpan>
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-lg/8 text-pretty text-(--paper)/60">
            Start free, upgrade when your agents need more room, and get two
            months free when you pay yearly.
          </p>
        </div>
        <PricingPlans />
      </section>

      {/* 9. #faq */}
      <section
        id="faq"
        className="mx-auto max-w-3xl scroll-mt-24 px-6 py-24 sm:py-32"
      >
        <div className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-6 text-4xl font-normal tracking-[-0.03em] text-balance text-(--paper) sm:text-5xl">
            Frequently Asked <AccentSpan>Questions</AccentSpan>
          </h2>
          <p className="mt-5 text-lg/8 text-(--paper)/60">
            Can&apos;t find what you need?{" "}
            <Link
              href="/contact"
              className="font-medium text-(--paper) underline decoration-(--paper)/30 underline-offset-4 transition-colors hover:decoration-(--paper)"
            >
              Contact us
            </Link>
            .
          </p>
        </div>
        <FaqAccordion items={FAQ_ITEMS} />
      </section>

      {/* 10. #get-started */}
      <GetStartedSection />

      {/* 11. Footer */}
      <PublicFooter />
    </div>
  );
}
