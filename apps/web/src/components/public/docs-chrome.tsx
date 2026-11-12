import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccentSpan } from "@/components/ui/accent-span";

const SIDEBAR = [
  {
    group: "Agents",
    items: [
      { label: "Overview", href: "/docs#overview" },
      { label: "How an agent works", href: "/docs#loop" },
      { label: "Autonomous chat", href: "/docs#chat" },
      { label: "Cloud Agent", href: "/docs#cloud-agent" },
      { label: "Built-in tools", href: "/docs#tools" },
      { label: "Models", href: "/docs#models" },
      { label: "Schedules", href: "/docs#schedules" },
      { label: "Limits", href: "/docs#limits" },
    ],
  },
  {
    group: "MCP",
    items: [
      { label: "What is MCP", href: "/docs/mcp#what-is-mcp" },
      { label: "Connect a server", href: "/docs/mcp#connect" },
      { label: "Servers with sign-in", href: "/docs/mcp#oauth" },
      { label: "Use tools in chat", href: "/docs/mcp#use" },
      { label: "Use tools in Cloud Agent", href: "/docs/mcp#cloud-agent-mcp" },
      { label: "Customize tools", href: "/docs/mcp#customize" },
      { label: "Void-Agent MCP server", href: "/docs/mcp#voidagent-server" },
      { label: "Safety", href: "/docs/mcp#safety" },
    ],
  },
];

/** Shared docs hero: eyebrow, H1, sub, and the Agents/MCP switcher. */
export function DocsHero({
  eyebrow,
  title,
  accent,
  sub,
  active,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  sub: string;
  active: "agents" | "mcp";
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-40 pb-16 text-center sm:pt-48">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-6 text-5xl leading-[1.03] font-normal tracking-[-0.04em] text-balance text-(--paper) sm:text-6xl lg:text-7xl">
        {title} <AccentSpan>{accent}</AccentSpan>
      </h1>
      <p className="mx-auto mt-5 max-w-[560px] text-lg/8 text-pretty text-(--paper)/60">
        {sub}
      </p>
      <div className="mt-8 inline-flex rounded-full border border-black/[0.08] bg-(--ink-2) p-1">
        <Link
          href="/docs"
          aria-current={active === "agents" ? "location" : undefined}
          className={
            active === "agents"
              ? "inline-flex h-8 items-center rounded-full bg-white px-4 text-sm font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
              : "inline-flex h-8 items-center rounded-full px-4 text-sm text-(--paper)/60 transition-colors hover:text-(--paper)"
          }
        >
          Agents
        </Link>
        <Link
          href="/docs/mcp"
          aria-current={active === "mcp" ? "location" : undefined}
          className={
            active === "mcp"
              ? "inline-flex h-8 items-center rounded-full bg-white px-4 text-sm font-medium text-(--paper) shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
              : "inline-flex h-8 items-center rounded-full px-4 text-sm text-(--paper)/60 transition-colors hover:text-(--paper)"
          }
        >
          MCP
        </Link>
      </div>
    </section>
  );
}

/** Shared sticky two-group docs sidebar with the rail + active state. */
export function DocsSidebar({
  activeGroup,
  activeHref,
}: {
  activeGroup: "agents" | "mcp";
  activeHref?: string;
}) {
  return (
    <nav
      aria-label="Docs"
      className="hidden self-start space-y-8 text-sm lg:sticky lg:top-28 lg:block"
    >
      {SIDEBAR.map((group) => (
        <div key={group.group}>
          <p className="mb-3 px-4 text-[11px] font-medium tracking-[0.14em] text-(--paper)/45 uppercase">
            {group.group}
          </p>
          <ul className="space-y-0.5 border-l border-black/10">
            {group.items.map((item) => {
              const isActive =
                group.group.toLowerCase() === activeGroup &&
                activeHref === item.href;
              return (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "location" : undefined}
                    className={
                      isActive
                        ? "-ml-px block border-l-2 border-(--brand-glow) py-1.5 pl-4 font-medium text-(--paper)"
                        : "-ml-px block border-l border-transparent py-1.5 pl-4 text-(--paper)/55 transition-colors hover:border-(--brand-glow) hover:text-(--paper)"
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
