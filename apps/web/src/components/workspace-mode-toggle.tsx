"use client";

import { cn } from "lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "ui/tabs";

export type WorkspaceMode = "work" | "cockpit";

export function workspaceModeOf(pathname: string | null): WorkspaceMode {
  return pathname === "/cockpit" || pathname?.startsWith("/cockpit/")
    ? "cockpit"
    : "work";
}

const MODES: Array<{ mode: WorkspaceMode; href: string }> = [
  { mode: "work", href: "/" },
  { mode: "cockpit", href: "/cockpit" },
];

/**
 * Work | Cockpit pill (Cognix §4.4 segmented control): a radiogroup with
 * track `bg-black/[0.03] ring-1 ring-black/[0.06]` and the selected option
 * carrying an absolutely-positioned white chip behind the label. The
 * shadcn Tabs primitive supplies the tablist semantics and arrow-key
 * roving focus; each trigger is a prefetched Link, so activating a
 * segment is a navigation and the active segment always follows the URL.
 */
export function WorkspaceModeToggle({
  variant = "default",
  className,
}: {
  variant?: "default" | "cockpit";
  className?: string;
}) {
  const t = useTranslations("Layout.workspaceMode");
  const active = workspaceModeOf(usePathname());
  const cockpit = variant === "cockpit";

  return (
    <Tabs value={active} className={cn("items-center", className)}>
      <TabsList
        aria-label={t("label")}
        className={cn(
          "h-9 rounded-full p-1 ring-1",
          cockpit
            ? "bg-[#101215] ring-black"
            : "bg-black/[0.03] ring-black/[0.06]",
        )}
      >
        {MODES.map(({ mode, href }) => (
          <TabsTrigger
            key={mode}
            value={mode}
            asChild
            className={cn(
              "h-7 rounded-full px-4 text-sm font-medium relative",
              !cockpit &&
                "text-foreground/50 hover:text-foreground/80 data-[state=active]:text-foreground",
              cockpit &&
                "border-0 text-[#8592a0] hover:text-[#e8eef2] data-[state=active]:bg-[#22262c] data-[state=active]:text-[#e8eef2] dark:data-[state=active]:bg-[#22262c] dark:data-[state=active]:text-[#e8eef2] dark:text-[#8592a0]",
            )}
          >
            <Link
              href={href}
              prefetch
              aria-current={active === mode ? "page" : undefined}
              aria-checked={active === mode}
            >
              {/* Cognix active white chip: an absolutely-positioned pill
                  behind the label (the ::before ring gives it depth). */}
              {!cockpit && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 rounded-full bg-white ring-1 ring-black/10 transition-opacity duration-150",
                    active === mode ? "opacity-100" : "opacity-0",
                  )}
                />
              )}
              <span className="relative">{t(mode)}</span>
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
