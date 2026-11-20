"use client";

import { cn } from "lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "ui/tabs";

type WorkspaceMode = "chat" | "agent";

export function isWorkspaceLandingPath(pathname: string | null): boolean {
  return pathname === "/" || pathname === "/cloud-agent";
}

const MODES: Array<{ mode: WorkspaceMode; href: string }> = [
  { mode: "chat", href: "/" },
  { mode: "agent", href: "/cloud-agent" },
];

function workspaceModeOf(pathname: string | null): WorkspaceMode {
  return pathname === "/cloud-agent" || pathname?.startsWith("/cloud-agent/")
    ? "agent"
    : pathname?.startsWith("/agent/")
      ? "agent"
      : "chat";
}

/** Chat and Agent navigation rendered above the home composer. */
export function WorkspaceModeToggle({ className }: { className?: string }) {
  const t = useTranslations("Layout.workspaceMode");
  const active = workspaceModeOf(usePathname());

  return (
    <Tabs value={active} className={cn("items-center", className)}>
      <TabsList
        aria-label={t("label")}
        className="h-9 rounded-full bg-black/[0.03] p-1 ring-1 ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.08]"
      >
        {MODES.map(({ mode, href }) => (
          <TabsTrigger
            key={mode}
            value={mode}
            asChild
            className={cn(
              "relative h-7 rounded-full border-0 px-4 text-sm font-medium shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent",
              active === mode
                ? "text-black data-[state=active]:text-black dark:text-black dark:data-[state=active]:text-black"
                : "text-foreground/60 hover:text-foreground dark:text-foreground/60",
            )}
          >
            <Link
              href={href}
              prefetch
              aria-current={active === mode ? "page" : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-full bg-white ring-1 ring-black/10 transition-opacity duration-150",
                  active === mode ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="relative">{t(mode)}</span>
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
