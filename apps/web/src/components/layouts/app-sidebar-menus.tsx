"use client";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "ui/sidebar";
import { Tooltip } from "ui/tooltip";

import { useStartNewChat } from "@/hooks/use-start-new-chat";
import { BasicUser } from "app-types/user";
import { Shortcuts, getShortcutKeyList } from "lib/keyboard-shortcuts";
import { getIsUserAdmin } from "lib/user/utils";
import {
  BookOpen,
  CalendarClock,
  MonitorSmartphone,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WriteIcon } from "ui/write-icon";
import { AppSidebarAdmin } from "./app-sidebar-menu-admin";

/**
 * Sidebar navigation menu items with the Void Agent active-chip treatment:
 * the current route's item gets `isActive` → the shadcn primitive applies
 * the `data-[active=true]` pill. Hover states use the Void Agent
 * `bg-black/[0.05]` fill rather than the shadcn default accent.
 */
export function AppSidebarMenus({ user }: { user?: BasicUser }) {
  const startNewChat = useStartNewChat();
  const t = useTranslations("");
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem className="mb-1">
              <Link
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenMobile(false);
                  startNewChat();
                }}
              >
                <SidebarMenuButton className="flex font-semibold group/new-chat bg-input/20 border border-border/40 hover:bg-black/[0.05]">
                  <WriteIcon className="size-4" />
                  {t("Layout.newChat")}
                  <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                    {getShortcutKeyList(Shortcuts.openNewChat).map((key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-accent rounded"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
          <SidebarMenuItem className="mb-1">
            <Link href="/library" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton
                isActive={pathname === "/library"}
                className="font-semibold"
                tooltip="Library"
              >
                <BookOpen className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Library
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem className="mb-1">
            <Link href="/customize" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton
                isActive={pathname === "/customize"}
                className="font-semibold"
                tooltip="Customize"
              >
                <SlidersHorizontal className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Customize
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem className="mb-1">
            <Link href="/schedules" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton
                isActive={pathname === "/schedules"}
                className="font-semibold"
                tooltip="Schedules"
              >
                <CalendarClock className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Schedules
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>

          <SidebarMenuItem className="mb-1">
            <Link href="/sandbox" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton
                isActive={pathname === "/sandbox"}
                className="font-semibold"
                tooltip="Sandbox"
              >
                <MonitorSmartphone className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Sandbox
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem className="mb-1">
            <Link href="/cyber" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton
                isActive={pathname.startsWith("/cyber")}
                className="font-semibold"
                tooltip="Void Cyber"
              >
                <Shield className="size-4 text-cyan-400" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Void Cyber
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
        {user && getIsUserAdmin({ role: user.role }) && <AppSidebarAdmin />}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
