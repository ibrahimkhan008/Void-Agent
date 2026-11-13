"use client";

import { cn } from "lib/utils";
import { Calendar, Clock, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

export interface IndexPost {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  tag: string;
  date: string;
  readTime: string;
  team: string;
  id: string;
  featured?: boolean;
}

export const CATEGORIES = [
  "All",
  "Product",
  "Announcements",
  "Models",
  "Engineering",
  "Security & Legal",
] as const;

export const POSTS: IndexPost[] = [
  {
    slug: "legal-update",
    title:
      "Legal & Governance Update: DPDP Act 2023, India-First Architecture, and Brand Refresh",
    subtitle: "Compliance, consent and a clearer brand.",
    excerpt:
      "Updating our legal architecture to comply with India's Digital Personal Data Protection Act 2023. Announcing our Grievance Redressal Officer, granular consent flows, transparent billing, and brand kit design on legal docs.",
    tag: "Security & Legal",
    date: "November 12, 2026",
    readTime: "4 min read",
    team: "Void Agent Team",
    id: "#4fda255",
    featured: true,
  },
  {
    slug: "introducing-canvas-editor",
    title: "Introducing the Canvas Editor",
    subtitle: "A visual studio for building alongside the agent.",
    excerpt:
      "Canvas gives you an interactive editor next to the chat: render web fragments, edit them live, and hand the result back to the agent as context.",
    tag: "Product",
    date: "November 4, 2026",
    readTime: "3 min read",
    team: "Void Agent Team",
    id: "#a17c340",
  },
  {
    slug: "cloud-agent-sandboxes",
    title: "Cloud Agent: Sandboxes with Live Preview URLs",
    subtitle: "A real Linux machine for every task.",
    excerpt:
      "Every Cloud Agent run now gets an isolated Linux sandbox with Node.js, Python and git, a live terminal, and a reverse-proxy preview URL for the apps it builds.",
    tag: "Engineering",
    date: "October 28, 2026",
    readTime: "5 min read",
    team: "Infra Team",
    id: "#b29d451",
  },
  {
    slug: "mcp-servers-ga",
    title: "MCP Servers Are Generally Available",
    subtitle: "Bring your own tools, from GitHub to your own APIs.",
    excerpt:
      "Connect any Model Context Protocol server, control which tools each chat or agent can use, and watch every call with its input and result in the thread.",
    tag: "Product",
    date: "October 21, 2026",
    readTime: "4 min read",
    team: "Void Agent Team",
    id: "#c30e562",
  },
  {
    slug: "visual-workflows",
    title: "Visual Workflows: Wire Up An Agent In A Minute",
    subtitle: "Triggers, tools, branches — on one canvas.",
    excerpt:
      "The workflow builder composes reusable AI workflows from LLM, HTTP and tool nodes. Runs are inspectable end to end, and every node is wiring you can read.",
    tag: "Product",
    date: "October 14, 2026",
    readTime: "4 min read",
    team: "Workflow Team",
    id: "#d41f673",
  },
  {
    slug: "new-models-october",
    title: "New Models: Frontier Additions Across Labs",
    subtitle: "30+ models, one workspace.",
    excerpt:
      "Fresh additions across our model catalog: stronger reasoning models, faster drafting models, and better code generation — all switchable mid-conversation.",
    tag: "Models",
    date: "October 7, 2026",
    readTime: "2 min read",
    team: "Model Team",
    id: "#e52a784",
  },
  {
    slug: "schedules-launch",
    title: "Schedules: Prompts That Run On Their Own",
    subtitle: "Recurring briefings without a cron file.",
    excerpt:
      "Save a prompt with a timetable — hourly, daily, weekdays or custom — and each run lands in your Library. Create them from the sidebar or straight from chat.",
    tag: "Product",
    date: "September 30, 2026",
    readTime: "3 min read",
    team: "Void Agent Team",
    id: "#f63b895",
  },
  {
    slug: "streaming-architecture",
    title: "Inside Our Streaming Architecture",
    subtitle: "Resumable streams, one token at a time.",
    excerpt:
      "How we keep chat streams alive across restarts: shared caches, durable jobs, and why a dropped connection no longer costs you a reply.",
    tag: "Engineering",
    date: "September 23, 2026",
    readTime: "6 min read",
    team: "Infra Team",
    id: "#a74c9a6",
  },
  {
    slug: "voice-modes",
    title: "Voice Modes Come To The Workspace",
    subtitle: "Speech in, speech out, mid-task.",
    excerpt:
      "Realtime voice input and playback join the chat: talk to the agent while it works, and hear summaries read back without leaving the thread.",
    tag: "Product",
    date: "September 16, 2026",
    readTime: "3 min read",
    team: "Voice Team",
    id: "#b85dab7",
  },
  {
    slug: "security-disclosure-policy",
    title: "Our Coordinated Vulnerability Disclosure Policy",
    subtitle: "Three business days to first response.",
    excerpt:
      "Security researchers can now reach a dedicated disclosure channel with a clear SLA. Here is how reports are triaged, and what you can expect from us.",
    tag: "Security & Legal",
    date: "September 9, 2026",
    readTime: "3 min read",
    team: "Security Team",
    id: "#c96ebc8",
  },
  {
    slug: "free-tier-expansion",
    title: "The Free Tier, Expanded",
    subtitle: "More weekly tokens, more preview runs.",
    excerpt:
      "The permanent free plan grows: more AI tokens a week, more Cloud Agent preview runs, and storage doubled — still no waitlist and no credit card.",
    tag: "Announcements",
    date: "September 2, 2026",
    readTime: "2 min read",
    team: "Void Agent Team",
    id: "#da7fcd9",
  },
];

export function IndexPostsClient() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return POSTS.filter((post) => {
      if (category !== "All" && post.tag !== category) return false;
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.subtitle.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        post.tag.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const featured = filtered.find((p) => p.featured) ?? null;
  const showFeatured = category === "All" && !query.trim() && featured;
  const gridPosts = showFeatured
    ? filtered.filter((p) => p !== featured)
    : filtered;

  return (
    <>
      {/* Filter bar */}
      <div className="mt-12 flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white/60 p-2 backdrop-blur-md lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                category === cat
                  ? "bg-[#121212] text-white"
                  : "text-(--paper)/60 hover:bg-black/[0.04] hover:text-(--paper)",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-[260px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--paper)/45" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search updates, models, tags..."
            aria-label="Search updates"
            className="w-full rounded-full border border-black/[0.1] bg-white py-2 pr-9 pl-9 text-sm text-(--paper) outline-none placeholder:text-(--paper)/45 focus-visible:ring-2 focus-visible:ring-(--paper)/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-(--paper)/45 hover:text-(--paper)"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Featured dispatch */}
      {showFeatured && featured && (
        <div className="mt-12">
          <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-(--paper)/55 uppercase">
            <Sparkles className="size-3.5 text-(--brand)" />
            Featured dispatch
          </p>
          <a
            href={`/index/${featured.slug}`}
            className="group relative mt-4 block overflow-hidden rounded-3xl border border-black/[0.08] bg-white p-6 shadow-sm transition-all hover:border-black/20 hover:shadow-xl sm:p-10"
          >
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-1/3"
              style={{
                background:
                  "linear-gradient(105deg, transparent 0%, rgba(11,122,63,0.06) 100%)",
              }}
            />
            <div className="relative grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <p className="flex flex-wrap items-center gap-2 text-xs text-(--paper)/55">
                  <span className="rounded-md bg-(--ink-2) px-2 py-0.5 font-medium text-(--paper)/70">
                    {featured.tag}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {featured.date}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {featured.readTime}
                  </span>
                </p>
                <h2 className="mt-4 text-3xl leading-[1.1] font-normal tracking-tight text-balance text-(--paper) transition-colors group-hover:text-[#0B7A3F] sm:text-5xl">
                  {featured.title}
                </h2>
                <p className="mt-4 max-w-[60ch] text-base/7 text-(--paper)/65">
                  {featured.excerpt}
                </p>
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-(--paper) transition-colors group-hover:text-[#0B7A3F]">
                  Read announcement
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </p>
              </div>
              <div className="relative hidden lg:col-span-5 lg:block">
                <div
                  className="aspect-video rounded-2xl border border-black/[0.08]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, #d6d6d1 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                  }}
                />
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-(--paper)/70 uppercase">
                    {featured.tag}
                  </span>
                  <span className="rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] text-(--paper)/55">
                    {featured.id}
                  </span>
                </div>
              </div>
            </div>
          </a>
        </div>
      )}

      {/* List header */}
      <h2 className="mt-16 text-3xl font-normal tracking-[-0.03em] text-(--paper) sm:text-4xl">
        {query.trim()
          ? `Search Results (${filtered.length})`
          : "All Articles & Dispatches"}
      </h2>
      {!query.trim() && (
        <p className="mt-2 font-mono text-xs text-(--paper)/50">
          Showing {filtered.length} of {POSTS.length} posts
        </p>
      )}

      {/* Post grid */}
      {filtered.length === 0 ? (
        <div className="mt-10 rounded-[20px] bg-(--ink-2) p-10 text-center">
          <p className="text-base text-(--paper)/65">
            No articles matched your criteria.
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory("All");
              setQuery("");
            }}
            className="mt-4 inline-flex h-10 items-center rounded-lg border border-black/[0.15] bg-white px-4 text-sm font-medium text-(--paper) transition-colors hover:bg-(--ink-2)"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 pb-32 sm:grid-cols-2 lg:grid-cols-3">
          {gridPosts.map((post) => (
            <a
              key={post.slug}
              href={`/index/${post.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-black/[0.07] bg-white p-5 shadow-xs transition-all duration-200 hover:border-black/20 hover:shadow-lg"
            >
              <div className="relative h-36 overflow-hidden rounded-xl bg-[#f5f5f3] ring-1 ring-black/[0.06] transition-[--tw-ring-color] group-hover:ring-[rgba(11,122,63,0.35)]">
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, #d8d8d3 1px, transparent 1px)",
                    backgroundSize: "12px 12px",
                  }}
                />
              </div>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-mono text-(--paper)/55">
                <span className="rounded-md bg-(--ink-2) px-1.5 py-0.5 text-(--paper)/70">
                  {post.tag}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" />
                  {post.date}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {post.readTime}
                </span>
              </p>
              <h3 className="mt-2.5 line-clamp-2 text-lg font-medium tracking-tight text-(--paper) transition-colors group-hover:text-[#0B7A3F]">
                {post.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm/6 text-(--paper)/65">
                {post.excerpt}
              </p>
              <p className="mt-auto flex items-center justify-between border-t border-black/[0.04] pt-4 font-mono text-[11px] text-(--paper)/55">
                <span>{post.team}</span>
                <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-[#0B7A3F]">
                  Read post
                  <span className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    ↗
                  </span>
                </span>
              </p>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
