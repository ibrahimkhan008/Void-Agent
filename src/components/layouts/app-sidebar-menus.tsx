"use client";
import { SidebarMenuButton, useSidebar } from "ui/sidebar";
import { SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroupContent } from "ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { appStore } from "@/app/store";
import { BasicUser } from "app-types/user";
import { Shortcuts, getShortcutKeyList } from "lib/keyboard-shortcuts";
import { getIsUserAdmin } from "lib/user/utils";
import {
  AudioLines,
  Box,
  Clock3,
  FolderKanban,
  GitBranch,
  Globe2,
  Hammer,
  Inbox,
  Library,
  PencilRuler,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Users,
  WalletCards,
  Waypoints,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SidebarGroup } from "ui/sidebar";
import { WriteIcon } from "ui/write-icon";
import { AppSidebarAdmin } from "./app-sidebar-menu-admin";

export function AppSidebarMenus({ user }: { user?: BasicUser }) {
  const router = useRouter();
  const t = useTranslations("");
  const { setOpenMobile, state } = useSidebar();
  const appStoreMutate = appStore((store) => store.mutate);
  const isCollapsed = state === "collapsed";

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem className="mb-1">
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenMobile(false);
                    router.push(`/`);
                    router.refresh();
                  }}
                >
                  <SidebarMenuButton className="flex font-semibold group/new-chat bg-input/20 border border-border/40">
                    <WriteIcon className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {t("Layout.newChat")}
                    </span>
                    <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity group-data-[collapsible=icon]:hidden">
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
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  {t("Layout.newChat")}
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/voice-inbox">
                  <SidebarMenuButton className="font-semibold">
                    <Inbox className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Voice inbox
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Voice inbox
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/team-members">
                  <SidebarMenuButton className="font-semibold">
                    <Users className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Team members
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Team members
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/cockpit">
                  <SidebarMenuButton className="font-semibold">
                    <WalletCards className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Cockpit
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Cockpit
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/workflow">
                  <SidebarMenuButton className="font-semibold">
                    <Waypoints className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {t("Layout.workflow")}
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  {t("Layout.workflow")}
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/published-pages">
                  <SidebarMenuButton className="font-semibold">
                    <Globe2 className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Published pages
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Published pages
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/schedules">
                  <SidebarMenuButton className="font-semibold">
                    <Clock3 className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Scheduled tasks
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Scheduled tasks
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/build">
                  <SidebarMenuButton className="font-semibold">
                    <Hammer className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Build
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Build
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/sandboxes">
                  <SidebarMenuButton className="font-semibold">
                    <Box className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Sandboxes
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Sandboxes
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/ecanvas">
                  <SidebarMenuButton className="font-semibold">
                    <PencilRuler className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      E Canvas
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  E Canvas
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/projects">
                  <SidebarMenuButton className="font-semibold">
                    <FolderKanban className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Projects
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Projects
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/team-model-routing">
                  <SidebarMenuButton className="font-semibold">
                    <GitBranch className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Team model routing
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Team model routing
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/voice-devices">
                  <SidebarMenuButton className="font-semibold">
                    <AudioLines className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Voice devices
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Voice devices
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/knowledge">
                  <SidebarMenuButton className="font-semibold">
                    <Library className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Knowledge
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Knowledge
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/tabular-reviews">
                  <SidebarMenuButton className="font-semibold">
                    <TableProperties className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Document reviews
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Document reviews
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/community">
                  <SidebarMenuButton className="font-semibold">
                    <Users className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Community
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Community
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <Link href="/plans" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton
                    className="font-semibold"
                    data-testid="sidebar-plans-link"
                  >
                    <Sparkles className="size-4 text-[#3d9e8c]" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {t("Layout.plans")}
                    </span>
                  </SidebarMenuButton>
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  {t("Layout.plans")}
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className="font-semibold w-full"
                  onClick={() => {
                    setOpenMobile(false);
                    appStoreMutate({ openCustomize: true });
                  }}
                >
                  <SlidersHorizontal className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    Customize
                  </span>
                </SidebarMenuButton>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" align="center">
                  Customize
                </TooltipContent>
              )}
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        {getIsUserAdmin(user) && <AppSidebarAdmin />}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
