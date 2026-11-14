"use client";
import { PanelLeft, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { AppSidebarUser } from "@/components/layouts/app-sidebar-user";
import { useStartNewChat } from "@/hooks/use-start-new-chat";
import { BasicUser } from "app-types/user";
import {
  Shortcut,
  Shortcuts,
  getShortcutKeyList,
} from "lib/keyboard-shortcuts";
import { cn } from "lib/utils";
import { useSidebar } from "ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/** Shortcut badge inside a rail tooltip (matches the header trigger's). */
export function RailTooltipKeys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1">
      {getShortcutKeyList(shortcut).map((key) => (
        <span
          key={key}
          className="w-5 h-5 flex items-center justify-center bg-muted rounded"
        >
          {key}
        </span>
      ))}
    </div>
  );
}

/**
 * ChatGPT-style collapsed rail (desktop): while the offcanvas sidebar is
 * closed, a slim fixed-width column keeps the entry points reachable — the
 * Void Agent logo at the top reopens the sidebar, the plus button starts a
 * new chat, and the avatar opens the account menu. Hovering an icon shows a
 * tooltip with its label and keyboard shortcut (the header trigger used to
 * render the same pattern). Rendered as a flex sibling of the sidebar gap
 * and `<main>` in `app-shell`, so it reserves layout space like ChatGPT's
 * rail instead of overlaying content. Always mounted and width-animated to
 * zero while open, so the collapse/expand slides instead of popping.
 */
export function SidebarCollapsedRail({ user }: { user?: BasicUser }) {
  const { open, toggleSidebar } = useSidebar();
  const startNewChat = useStartNewChat();
  const t = useTranslations("Layout");
  const tk = useTranslations("KeyboardShortcuts");

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
        {/* The logo reopens the sidebar (ChatGPT pattern); on hover it fades
            into a highlighted PanelLeft chip, mirroring ChatGPT's rail. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={tk("toggleSidebar")}
              data-testid="sidebar-rail-logo"
              onClick={toggleSidebar}
              className="group/logo relative inline-flex items-center justify-center rounded-md size-9 hover:bg-sidebar-accent transition-colors"
            >
              <Image
                src="/logo-512.webp"
                alt="Void Agent"
                width={28}
                height={28}
                className="rounded-md transition-opacity group-hover/logo:opacity-0"
              />
              <span
                aria-hidden
                className="absolute inset-0 inline-flex items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground opacity-0 group-hover/logo:opacity-100 transition-opacity"
              >
                <PanelLeft className="size-4" />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" align="center">
            <div className="flex items-center gap-2">
              {tk("toggleSidebar")}
              <RailTooltipKeys shortcut={Shortcuts.toggleSidebar} />
            </div>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("newChat")}
              data-testid="sidebar-rail-new-chat"
              onClick={startNewChat}
              className="inline-flex items-center justify-center rounded-md size-9 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <PlusIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" align="center">
            <div className="flex items-center gap-2">
              {t("newChat")}
              <RailTooltipKeys shortcut={Shortcuts.openNewChat} />
            </div>
          </TooltipContent>
        </Tooltip>
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
