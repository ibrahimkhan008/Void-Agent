import { Catalog } from "@/components/landing/catalog";
import { Cta } from "@/components/landing/cta";
import { Developers } from "@/components/landing/developers";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Network } from "@/components/landing/network";
import { Pricing } from "@/components/landing/pricing";
import { Workflows } from "@/components/landing/workflows";
import type { Metadata } from "next";

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
    <div className="w-full bg-[#0a0a0a]">
      <main>
        <Hero />
        <Features />
        <Workflows />
        <Network />
        <Developers />
        <Catalog />
        <Pricing />
        <Faq items={FAQ_ITEMS} />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
