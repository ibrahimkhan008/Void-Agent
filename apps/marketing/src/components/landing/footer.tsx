import { TOKENS, VoidAgentMark } from "@/components/landing/ui";
import { IconBrandGithub } from "@tabler/icons-react";
import { APP_URL } from "lib/site";
import Link from "next/link";

type FooterLink = {
  label: string;
  href: string;
  badge?: string;
  newTab?: boolean;
};

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Workflows", href: "/#workflows" },
      { label: "Models", href: "/#models" },
      { label: "Pricing", href: "/pricing" },
      { label: "Schedules", href: `${APP_URL}/sign-up`, badge: "New" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "MCP guide", href: "/docs/mcp" },
      // The MCP discovery document is an app-domain API route.
      {
        label: "MCP server",
        href: `${APP_URL}/.well-known/mcp.json`,
        newTab: true,
      },
      { label: "llms.txt", href: "/llms.txt", newTab: true },
      { label: "design.md", href: "/design.md", newTab: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Index", href: "/updates", badge: "New" },
      { label: "Brand kit", href: "/branding" },
      { label: "Void Agent vs Manus", href: "/vs/manus" },
      { label: "Contact", href: "/contact" },
      { label: "Contact sales", href: "/contact-sales" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy-policy" },
      { label: "Terms of service", href: "/terms-of-service" },
      { label: "Cookies policy", href: "/cookies-policy" },
      { label: "Refunds", href: "/refund-policy" },
      { label: "Grievance and data rights", href: "/grievance-redressal" },
    ],
  },
];

const focusRing =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)";

/** Landing footer: same link map as the site-wide footer, on the landing's dark surface. */
export function Footer() {
  return (
    <footer style={TOKENS} className="bg-(--ink) text-(--paper)">
      <div className="mx-auto max-w-7xl px-6 pt-8 pb-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="col-span-full md:col-span-1">
            <Link
              href="/"
              aria-label="Homepage"
              className={`flex w-fit items-center gap-2.5 ${focusRing}`}
            >
              <VoidAgentMark className="size-7" />
              <span className="text-lg font-semibold tracking-tight">
                Void Agent
              </span>
            </Link>
            <p className="mt-4 max-w-[30ch] text-base text-pretty text-(--paper)/50 sm:text-sm">
              One workspace for AI chat, files, images, workflows and cloud
              coding agents, on any model.
            </p>
            <a
              href="mailto:support@voidagent.space"
              className={`mt-3 inline-block text-base text-(--paper)/55 underline decoration-(--paper)/20 underline-offset-4 transition-colors duration-150 hover:text-(--paper) sm:text-sm ${focusRing}`}
            >
              support@voidagent.space
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-base font-medium text-(--paper) sm:text-sm">
                {column.title}
              </p>
              <ul role="list" className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.newTab ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 text-base text-(--paper)/55 transition-colors duration-150 hover:text-(--paper) sm:text-sm ${focusRing}`}
                      >
                        {link.label}
                        {link.badge && (
                          <span className="rounded-full bg-(--brand)/15 px-1.5 py-0.5 text-[10px] font-medium text-(--brand)">
                            {link.badge}
                          </span>
                        )}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className={`inline-flex items-center gap-2 text-base text-(--paper)/55 transition-colors duration-150 hover:text-(--paper) sm:text-sm ${focusRing}`}
                      >
                        {link.label}
                        {link.badge && (
                          <span className="rounded-full bg-(--brand)/15 px-1.5 py-0.5 text-[10px] font-medium text-(--brand)">
                            {link.badge}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-6 border-t border-white/[0.06] pt-6 text-xs text-(--paper)/45 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/ibrahimkhan008"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Void Agent on GitHub"
              className={`relative grid size-8 place-items-center text-(--paper)/50 transition-colors duration-150 hover:text-(--paper) ${focusRing}`}
            >
              <IconBrandGithub className="size-4" stroke={1.75} aria-hidden />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/privacy-policy"
              className={`hover:text-(--paper)/80 ${focusRing}`}
            >
              Privacy
            </Link>
            <Link
              href="/terms-of-service"
              className={`hover:text-(--paper)/80 ${focusRing}`}
            >
              Terms
            </Link>
            <span>© 2026 Void Agent. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
