"use client";

import {
  ArrowUpRightIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  MoreHorizontal,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { SidebarMenuAction } from "ui/sidebar";
import { SidebarMenuButton, SidebarMenuSkeleton } from "ui/sidebar";
import { SidebarGroupContent, SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroup } from "ui/sidebar";

import { useMounted } from "@/hooks/use-mounted";

import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { useAgents } from "@/hooks/queries/use-agents";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { AgentDropdown } from "../agent/agent-dropdown";
import { SidebarLoadError } from "./sidebar-load-error";

import { appStore } from "@/app/store";
import { ChatMention } from "app-types/chat";
import { canCreateAgent } from "lib/auth/client-permissions";
import { BACKGROUND_COLORS, EMOJI_DATA } from "lib/const";
import { cn } from "lib/utils";
import { useRouter } from "next/navigation";

const DISPLAY_LIMIT = 5; // Number of agents to show when collapsed

export function AppSidebarAgents({ userRole }: { userRole?: string | null }) {
  const mounted = useMounted();
  const t = useTranslations();
  const router = useRouter();
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const {
    bookmarkedAgents,
    myAgents,
    isLoading,
    error: agentsError,
    mutate: retryAgents,
    sharedAgents,
  } = useAgents({
    limit: 50,
  }); // Increase limit since we're not artificially limiting display

  const agents = useMemo(() => {
    return [...myAgents, ...bookmarkedAgents];
  }, [bookmarkedAgents, myAgents]);

  const handleAgentClick = useCallback(
    (id: string) => {
      const currentThreadId = appStore.getState().currentThreadId;
      const agent = agents.find((agent) => agent.id === id);

      if (!agent) return;

      const newMention: ChatMention = {
        type: "agent",
        agentId: agent.id,
        name: agent.name,
        icon: agent.icon,
        description: agent.description,
      };

      if (currentThreadId) {
        appStore.setState((prev) => {
          const currentMentions = prev.threadMentions[currentThreadId] || [];

          const target = currentMentions.find(
            (mention) =>
              mention.type == "agent" && mention.agentId === agent.id,
          );

          if (target) {
            return prev;
          }

          return {
            threadMentions: {
              ...prev.threadMentions,
              [currentThreadId]: [
                ...currentMentions.filter((v) => v.type != "agent"),
                newMention,
              ],
            },
          };
        });
      } else {
        router.push("/dashboard");

        appStore.setState(() => ({
          pendingThreadMention: newMention,
        }));
      }
    },
    [agents, router],
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/agents">
        <div className="group/agent-section mb-1 flex h-8 items-center gap-1 px-2">
          <button
            type="button"
            aria-expanded={sectionOpen}
            aria-controls="sidebar-agent-list"
            data-testid="sidebar-agents-toggle"
            onClick={() => setSectionOpen((value) => !value)}
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{t("Layout.agents")}</span>
            {sectionOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/agents"
                  aria-label="All agents"
                  data-testid="sidebar-all-agents-link"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <LayoutGrid className="size-3.5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                All agents
              </TooltipContent>
            </Tooltip>
            {canCreateAgent(userRole) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/agent/new"
                    aria-label={t("Agent.newAgent")}
                    data-testid="sidebar-create-agent-button"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <PlusIcon className="size-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  {t("Agent.newAgent")}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        {sectionOpen ? (
          <SidebarMenu
            className="group/agents"
            data-testid="sidebar-agent-list"
            id="sidebar-agent-list"
          >
            {isLoading ? (
              <SidebarMenuItem>
                {Array.from({ length: 2 }).map(
                  (_, index) => mounted && <SidebarMenuSkeleton key={index} />,
                )}
              </SidebarMenuItem>
            ) : agentsError && agents.length == 0 ? (
              <SidebarLoadError
                label="Couldn't load agents"
                onRetry={() => retryAgents()}
              />
            ) : agents.length == 0 ? (
              <div className="px-2 mt-1">
                {canCreateAgent(userRole) ? (
                  <Link
                    href={"/agent/new"}
                    className="flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                    data-testid="sidebar-create-agent-link"
                  >
                    <span className="inline-flex size-5 items-center justify-center rounded-full border text-muted-foreground">
                      <PlusIcon className="size-3" />
                    </span>
                    <span>{t("Layout.createAgent")}</span>
                    <ArrowUpRightIcon className="ml-auto size-3 text-muted-foreground" />
                  </Link>
                ) : (
                  <div className="bg-input/40 py-8 px-4 rounded-lg text-xs overflow-hidden">
                    <div className="gap-1 z-10">
                      <p className="font-semibold mb-2">
                        {sharedAgents.length > 0
                          ? t("Layout.availableAgents")
                          : t("Layout.noAgentsAvailable")}
                      </p>
                      <p className="text-muted-foreground">
                        {sharedAgents.length > 0
                          ? t("Layout.browseAgentsToBookmark")
                          : t("Layout.askAdminToShareAgents")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="relative">
                  {expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-4 z-10 pointer-events-none bg-gradient-to-t from-background to-transparent" />
                  )}
                  <div
                    className={cn(
                      "w-full",
                      expanded && "max-h-[400px] overflow-y-auto",
                    )}
                  >
                    {(expanded ? agents : agents.slice(0, DISPLAY_LIMIT))?.map(
                      (agent, i) => {
                        return (
                          <SidebarMenu
                            key={agent.id}
                            className="group/agent mr-0 w-full"
                          >
                            <SidebarMenuItem
                              className="px-2 cursor-pointer w-full"
                              onClick={() => handleAgentClick(agent.id)}
                            >
                              <SidebarMenuButton
                                asChild
                                className="data-[state=open]:bg-input! w-full"
                              >
                                <div className="flex gap-1 w-full min-w-0">
                                  <div
                                    className="p-1 rounded-full ring-2 ring-border bg-background"
                                    style={{
                                      backgroundColor:
                                        agent.icon?.style?.backgroundColor ||
                                        BACKGROUND_COLORS[
                                          i % BACKGROUND_COLORS.length
                                        ],
                                    }}
                                  >
                                    <Avatar className="size-3.5">
                                      <AvatarImage
                                        src={
                                          agent.icon?.value ||
                                          EMOJI_DATA[i % EMOJI_DATA.length]
                                        }
                                      />
                                      <AvatarFallback className="bg-transparent">
                                        {agent.name[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                  </div>

                                  <div className="flex items-center min-w-0 w-full">
                                    <p
                                      className="truncate"
                                      data-testid="sidebar-agent-name"
                                    >
                                      {agent.name}
                                    </p>
                                  </div>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                    }}
                                  >
                                    <AgentDropdown
                                      agent={agent}
                                      side="right"
                                      align="start"
                                    >
                                      <SidebarMenuAction className="data-[state=open]:bg-input! data-[state=open]:opacity-100  opacity-0 group-hover/agent:opacity-100 mr-2">
                                        <MoreHorizontal className="size-4" />
                                      </SidebarMenuAction>
                                    </AgentDropdown>
                                  </div>
                                </div>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        );
                      },
                    )}
                  </div>
                </div>

                {/* Show More/Less Button */}
                {agents.length > DISPLAY_LIMIT && (
                  <SidebarMenu className="group/showmore">
                    <SidebarMenuItem className="px-2 cursor-pointer">
                      <SidebarMenuButton
                        onClick={() => setExpanded(!expanded)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <div className="flex items-center gap-1">
                          <p className="text-xs">
                            {expanded
                              ? t("Common.showLess")
                              : t("Common.showMore")}
                          </p>
                          {expanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                )}
              </div>
            )}
          </SidebarMenu>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
