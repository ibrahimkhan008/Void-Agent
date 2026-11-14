"use client";
import { SidebarMenuAction, SidebarMenuButton, useSidebar } from "ui/sidebar";
import { SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroupContent } from "ui/sidebar";
import { Tooltip } from "ui/tooltip";

import { useStartNewChat } from "@/hooks/use-start-new-chat";
import { requireCredits } from "@/lib/billing/require-credits";
import { BasicUser } from "app-types/user";
import { Shortcuts, getShortcutKeyList } from "lib/keyboard-shortcuts";
import { getIsUserAdmin } from "lib/user/utils";
import {
  Brain,
  FolderSearchIcon,
  Globe,
  Library,
  PanelsTopLeft,
  PlusIcon,
  Rocket,
  Waypoints,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MCPIcon } from "ui/mcp-icon";
import { SidebarGroup } from "ui/sidebar";
import { WriteIcon } from "ui/write-icon";
import { ProjectDialog } from "../projects/project-dialog";
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
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(href + "/");
  };

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
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/mcp">
                <SidebarMenuButton
                  isActive={isActive("/mcp")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <MCPIcon className="size-4 fill-accent-foreground" />
                  {t("Layout.mcpConfiguration")}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/workflow">
                <SidebarMenuButton
                  isActive={isActive("/workflow")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <Waypoints className="size-4" />
                  {t("Layout.workflow")}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/ecanvas" onClick={() => setOpenMobile(false)}>
                <SidebarMenuButton
                  isActive={isActive("/ecanvas")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <PanelsTopLeft className="size-4" />
                  Canvas
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/knowledge" onClick={() => setOpenMobile(false)}>
                <SidebarMenuButton
                  isActive={isActive("/knowledge")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <Library className="size-4" />
                  Collections
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/build" onClick={() => setOpenMobile(false)}>
                <SidebarMenuButton
                  isActive={isActive("/build")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <Rocket className="size-4" />
                  App Builder
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/deploy" onClick={() => setOpenMobile(false)}>
                <SidebarMenuButton
                  isActive={isActive("/deploy")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <Globe className="size-4" />
                  Void Deploy
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/memory" onClick={() => setOpenMobile(false)}>
                <SidebarMenuButton
                  isActive={isActive("/memory")}
                  className="font-medium hover:bg-black/[0.05] data-[active=true]:bg-white data-[active=true]:shadow-[var(--shadow-chip)] data-[active=true]:ring-1 data-[active=true]:ring-black/10"
                >
                  <Brain className="size-4" />
                  Void Memory
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-medium hover:bg-black/[0.05]"
                onClick={() => {
                  if (!requireCredits()) return;
                  setAddProjectDialogOpen(true);
                }}
              >
                <PlusIcon className="size-4" />
                Projects
              </SidebarMenuButton>
              <SidebarMenuAction
                className="top-1.5"
                showOnHover
                onClick={() => {
                  if (!requireCredits()) return;
                  setAddProjectDialogOpen(true);
                }}
              >
                <FolderSearchIcon className="size-4" />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <ProjectDialog
          open={addProjectDialogOpen}
          onOpenChange={setAddProjectDialogOpen}
        >
          <SidebarMenuButton
            className="font-medium hover:bg-black/[0.05]"
            onClick={() => {
              if (!requireCredits()) return;
              setAddProjectDialogOpen(true);
            }}
          >
            <PlusIcon className="size-4" />
            Projects
          </SidebarMenuButton>
        </ProjectDialog>
        {user && getIsUserAdmin({ role: user.role }) && <AppSidebarAdmin />}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
