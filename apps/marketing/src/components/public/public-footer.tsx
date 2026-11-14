import { APP_URL } from "lib/site";
import Image from "next/image";
import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string; newPill?: boolean; newTab?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Workflows", href: "/#workflows" },
      { label: "Models", href: "/#models" },
      { label: "Pricing", href: "/pricing" },
      { label: "Schedules", href: `${APP_URL}/sign-up`, newPill: true },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "MCP guide", href: "/docs/mcp" },
      // The MCP discovery document is an app-domain API route.
      { label: "MCP server", href: `${APP_URL}/.well-known/mcp.json`, newTab: true },
      { label: "llms.txt", href: "/llms.txt", newTab: true },
      { label: "design.md", href: "/design.md", newTab: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Index", href: "/updates", newPill: true },
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

/**
 * Public marketing footer (§2.3): five-column grid, bottom bar with socials,
 * and the giant clipped watermark band over a dithered texture.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-(--paper)/[0.06] bg-(--ink)">
      <div className="mx-auto max-w-7xl px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="relative block size-7 shrink-0">
                <Image
                  src="/logo-va-512.webp"
                  alt="Void Agent"
                  width={28}
                  height={28}
                  className="object-contain"
                />
              </span>
              <span className="text-[17px] font-medium tracking-[-0.01em] text-(--paper)">
                Void Agent
              </span>
            </Link>
            <p className="mt-3 max-w-[40ch] text-sm/6 text-(--paper)/55">
              One workspace for AI chat, files, images, workflows and cloud
              coding agents, on any model.
            </p>
            <a
              href="mailto:support@voidagent.space"
              className="mt-3 inline-block text-sm text-(--paper)/55 underline decoration-(--paper)/20 underline-offset-4 hover:text-(--paper)"
            >
              support@voidagent.space
            </a>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-medium text-(--paper)">{column.title}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...(link.newTab
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="inline-flex items-center gap-1.5 text-sm text-(--paper)/55 transition-colors duration-150 hover:text-(--paper)"
                    >
                      {link.label}
                      {link.newPill && (
                        <span className="rounded-md bg-(--brand)/10 px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] text-(--brand) uppercase">
                          New
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-(--paper)/[0.06] pt-6">
          <a
            href="https://github.com/ibrahimkhan008"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--paper)/45 transition-colors hover:text-(--paper)"
          >
            GitHub
          </a>
          <Link
            href="/privacy-policy"
            className="text-sm text-(--paper)/45 transition-colors hover:text-(--paper)"
          >
            Privacy
          </Link>
          <Link
            href="/terms-of-service"
            className="text-sm text-(--paper)/45 transition-colors hover:text-(--paper)"
          >
            Terms
          </Link>
          <p className="ml-auto text-sm text-(--paper)/45">
            © 2026 Void Agent. All rights reserved.
          </p>
        </div>
      </div>

      {/* Giant clipped watermark band over a dithered texture */}
      <div
        aria-hidden
        className="relative mx-auto h-[clamp(140px,22vw,320px)] max-w-[1600px] overflow-hidden"
      >
        <Image
          src="/images/dither-footer.png?v=2"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-top [image-rendering:pixelated]"
        />
        <div
          className="gradient-brand absolute inset-0 opacity-25 mix-blend-multiply"
          style={{
            maskImage:
              "radial-gradient(ellipse 75% 80% at 50% 92%, black 45%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 80% at 50% 92%, black 45%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-x-0 -bottom-[0.18em] text-center text-[clamp(96px,19vw,300px)] leading-none font-medium tracking-[-0.06em] text-(--paper)/[0.08]"
        >
          Void Agent
        </div>
      </div>
    </footer>
  );
}
