"use client";
import { useEffect } from "react";
import { Sidebar, SidebarContent, SidebarFooter } from "ui/sidebar";

import { AppSidebarAgents } from "./app-sidebar-agents";
import { AppSidebarArchives } from "./app-sidebar-archives";
import { AppSidebarMenus } from "./app-sidebar-menus";
import { AppSidebarThreads } from "./app-sidebar-threads";
import { SidebarHeaderShared } from "./sidebar-header";

import { useStartNewChat } from "@/hooks/use-start-new-chat";
import { BasicUser } from "app-types/user";
import { Shortcuts, isShortcutEvent } from "lib/keyboard-shortcuts";
import { AppSidebarUser } from "./app-sidebar-user";

export function AppSidebar({
  user,
}: {
  user?: BasicUser;
}) {
  const userRole = user?.role;
  const startNewChat = useStartNewChat();

  // Handle new chat shortcut (specific to main app)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [startNewChat]);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80"
    >
      <SidebarHeaderShared
        title="Void-Agent"
        href="/"
        enableShortcuts={true}
        onLinkClick={startNewChat}
      />

      <SidebarContent className="mt-2 overflow-hidden relative">
        <div className="flex flex-col overflow-y-auto">
          <AppSidebarMenus user={user} />
          <AppSidebarAgents userRole={userRole} />
          <AppSidebarArchives />
          <AppSidebarThreads />
        </div>
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        <AppSidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
