"use client";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { AppSidebarUser } from "@/components/layouts/app-sidebar-user";
import { useStartNewChat } from "@/hooks/use-start-new-chat";
import { BasicUser } from "app-types/user";
import { cn } from "lib/utils";
import { useSidebar } from "ui/sidebar";

/**
 * ChatGPT-style collapsed rail (desktop): while the offcanvas sidebar is
 * closed, a slim fixed-width column keeps the entry points reachable — the
 * Void Agent logo at the top reopens the sidebar, the plus button starts a
 * new chat. Rendered as a flex sibling of the sidebar gap and `<main>` in
 * `app-shell`, so it reserves layout space like ChatGPT's rail instead of
 * overlaying content. Always mounted and width-animated to zero while open,
 * so the collapse/expand slides instead of popping.
 */
export function SidebarCollapsedRail({ user }: { user?: BasicUser }) {
  const { open, toggleSidebar } = useSidebar();
  const startNewChat = useStartNewChat();
  const t = useTranslations("Layout");

  return (
    <div
      aria-hidden={open}
      data-testid="sidebar-collapsed-rail"
      className={cn(
        "hidden md:block shrink-0 overflow-hidden transition-[width] duration-200 ease-linear",
        open ? "w-0" : "w-14",
      )}
    >
      <div
        className={cn(
          "flex h-full w-14 flex-col items-center gap-1 border-r border-sidebar-border/80 bg-sidebar py-3",
          open && "opacity-0",
        )}
      >
        {/* The logo reopens the sidebar (ChatGPT pattern). */}
        <button
          type="button"
          aria-label="Open sidebar"
          title="Open sidebar"
          data-testid="sidebar-rail-logo"
          onClick={toggleSidebar}
          className="inline-flex items-center justify-center rounded-md size-9 hover:bg-sidebar-accent transition-colors"
        >
          <Image
            src="/logo-512.webp"
            alt="Void Agent"
            width={28}
            height={28}
            className="rounded-md"
          />
        </button>
        <button
          type="button"
          aria-label={t("newChat")}
          title={t("newChat")}
          data-testid="sidebar-rail-new-chat"
          onClick={startNewChat}
          className="inline-flex items-center justify-center rounded-md size-9 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <PlusIcon className="size-4" />
        </button>
        {/* Profile at the bottom, ChatGPT-style: the avatar opens the same
            account menu as the sidebar footer's user section. Rendered only
            with a known user — the shell always passes one, and skipping it
            keeps SWR from firing where no session exists (tests). */}
        <div className="mt-auto">
          {user ? <AppSidebarUser user={user} variant="compact" /> : null}
        </div>
      </div>
    </div>
  );
}
