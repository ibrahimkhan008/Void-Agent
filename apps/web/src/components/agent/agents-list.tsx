"use client";
import { Eyebrow } from "@/components/ui/eyebrow";

import { appStore } from "@/app/store";
import { AgentLibraryDrawer } from "@/components/agent/agent-library-drawer";
import { ScheduleStatusBadge } from "@/components/scheduled-tasks/schedule-status-badge";
import { Visibility } from "@/components/shareable-actions";
import { ShareableCard } from "@/components/shareable-card";
import { useMutateAgents } from "@/hooks/queries/use-agents";
import { useBookmark } from "@/hooks/queries/use-bookmark";
import { useScheduledTasks } from "@/hooks/queries/use-scheduled-tasks";
import { analytics } from "@/lib/analytics/posthog";
import { AgentSummary, AgentUpdateSchema } from "app-types/agent";
import { canCreateAgent } from "lib/auth/client-permissions";
import { notify } from "lib/notify";
import { fetcher } from "lib/utils";
import { ArrowUpRight, Library, Plus, Shield, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { safe } from "ts-safe";
import { BackgroundPaths } from "ui/background-paths";
import { Button } from "ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { handleErrorWithToast } from "ui/shared-toast";
import { useShallow } from "zustand/shallow";

export interface CyberAgentSummary {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isShared: boolean;
  isBuiltin?: boolean;
  openHref?: string;
  editHref?: string | null;
}

interface AgentsListProps {
  initialMyAgents: AgentSummary[];
  initialSharedAgents: AgentSummary[];
  initialCyberAgents?: CyberAgentSummary[];
  userId: string;
  userRole?: string | null;
}

export function AgentsList({
  initialMyAgents,
  initialSharedAgents,
  initialCyberAgents = [],
  userId,
  userRole,
}: AgentsListProps) {
  const t = useTranslations();
  const mutateAgents = useMutateAgents();
  const [cyberAgents, setCyberAgents] =
    useState<CyberAgentSummary[]>(initialCyberAgents);
  const [deletingCyberId, setDeletingCyberId] = useState<string | null>(null);
  const [deletingAgentLoading, setDeletingAgentLoading] = useState<
    string | null
  >(null);
  const [visibilityChangeLoading, setVisibilityChangeLoading] = useState<
    string | null
  >(null);

  const { data: allAgents } = useSWR(
    "/api/agent?filters=mine,shared",
    fetcher,
    {
      fallbackData: [...initialMyAgents, ...initialSharedAgents],
    },
  );

  const myAgents =
    allAgents?.filter((agent: AgentSummary) => agent.userId === userId) ||
    initialMyAgents;

  const sharedAgents =
    allAgents?.filter((agent: AgentSummary) => agent.userId !== userId) ||
    initialSharedAgents;

  const { toggleBookmark: toggleBookmarkHook, isLoading: isBookmarkLoading } =
    useBookmark({
      itemType: "agent",
    });

  const { byAgentId: scheduleByAgentId } = useScheduledTasks();

  const toggleBookmark = async (agentId: string, isBookmarked: boolean) => {
    await toggleBookmarkHook({ id: agentId, isBookmarked });
  };

  const updateVisibility = async (agentId: string, visibility: Visibility) => {
    // Find current agent to get old visibility
    const currentAgent = allAgents?.find((a: AgentSummary) => a.id === agentId);
    const oldVisibility = currentAgent?.visibility;

    safe(() => setVisibilityChangeLoading(agentId))
      .map(() => AgentUpdateSchema.parse({ visibility }))
      .map(JSON.stringify)
      .map(async (body) =>
        fetcher(`/api/agent/${agentId}`, {
          method: "PUT",
          body,
        }),
      )
      .ifOk(() => {
        mutateAgents({ id: agentId, visibility });

        // Track visibility change
        if (oldVisibility) {
          analytics.agentVisibilityChanged({
            agentId,
            oldVisibility,
            newVisibility: visibility,
          });
        }
      })
      .ifFail((e) => {
        handleErrorWithToast(e);
        toast.error(t("Common.error"));
      })
      .watch(() => setVisibilityChangeLoading(null));
  };

  const deleteAgent = async (agentId: string) => {
    // Find agent to get name for tracking
    const agentToDelete = allAgents?.find(
      (a: AgentSummary) => a.id === agentId,
    );

    const ok = await notify.confirm({
      description: t("Agent.deleteConfirm"),
    });
    if (!ok) return;
    safe(() => setDeletingAgentLoading(agentId))
      .map(() =>
        fetcher(`/api/agent/${agentId}`, {
          method: "DELETE",
        }),
      )
      .ifOk(() => {
        mutateAgents({ id: agentId }, true);

        // Track agent deletion
        analytics.agentDeleted({
          agentId,
          name: agentToDelete?.name,
        });
      })
      .ifFail((e) => {
        handleErrorWithToast(e);
        toast.error(t("Common.error"));
      })
      .watch(() => setDeletingAgentLoading(null));
  };

  const deleteCyberAgent = async (agentId: string) => {
    const ok = await notify.confirm({
      description: t("Agent.deleteConfirm"),
    });
    if (!ok) return;
    setDeletingCyberId(agentId);
    try {
      const res = await fetch(`/api/cyber/agents/${agentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("Common.error"));
        return;
      }
      setCyberAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch {
      toast.error(t("Common.error"));
    } finally {
      setDeletingCyberId(null);
    }
  };

  // Check if user can create agents using Better Auth permissions
  const canCreate = canCreateAgent(userRole);
  const appStoreMutate = appStore(useShallow((state) => state.mutate));

  return (
    <div className="w-full flex flex-col gap-4 p-8">
      <AgentLibraryDrawer />

      <div className="flex justify-between items-center">
        <Eyebrow>Agents</Eyebrow>
        <h1
          className="text-3xl font-normal tracking-[-0.03em] text-balance"
          data-testid="agents-title"
        >
          {t("Layout.agents")}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => appStoreMutate({ openAgentLibrary: true })}
          >
            <Library className="size-4" />
            Agent Library
          </Button>
          {canCreate && (
            <Link href="/agent/new">
              <Button variant="ghost" data-testid="create-agent-button">
                <Plus />
                {t("Agent.newAgent")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* My Agents Section */}
      {(canCreate || myAgents.length > 0) && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t("Agent.myAgents")}</h2>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {canCreate && (
              <Link href="/agent/new">
                <Card
                  className="relative bg-secondary overflow-hidden cursor-pointer hover:bg-input transition-colors h-[196px]"
                  data-testid="create-agent-card"
                >
                  <div className="absolute inset-0 w-full h-full opacity-50">
                    <BackgroundPaths />
                  </div>
                  <CardHeader>
                    <CardTitle>
                      <h1 className="text-lg font-bold">
                        {t("Agent.newAgent")}
                      </h1>
                    </CardTitle>
                    <CardDescription className="mt-2">
                      <p>{t("Layout.createYourOwnAgent")}</p>
                    </CardDescription>
                    <div className="mt-auto ml-auto flex-1">
                      <Button variant="ghost" size="lg">
                        {t("Common.create")}
                        <ArrowUpRight className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {myAgents.map((agent) => {
              const schedule = scheduleByAgentId.get(agent.id);
              return (
                <ShareableCard
                  key={agent.id}
                  type="agent"
                  item={agent}
                  href={`/agent/${agent.id}`}
                  onVisibilityChange={updateVisibility}
                  isVisibilityChangeLoading={
                    visibilityChangeLoading === agent.id
                  }
                  isDeleteLoading={deletingAgentLoading === agent.id}
                  onDelete={deleteAgent}
                  headerMeta={
                    schedule ? (
                      <ScheduleStatusBadge
                        task={schedule}
                        className="min-w-0 truncate"
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Shared/Available Agents Section */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("Agent.sharedAgents")}</h2>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sharedAgents.map((agent) => (
            <ShareableCard
              key={agent.id}
              type="agent"
              item={agent}
              isOwner={false}
              href={`/agent/${agent.id}`}
              onBookmarkToggle={toggleBookmark}
              isBookmarkToggleLoading={isBookmarkLoading(agent.id)}
            />
          ))}
          {sharedAgents.length === 0 && (
            <Card className="col-span-full bg-transparent border-none">
              <CardHeader className="text-center py-12">
                <CardTitle>
                  {canCreate
                    ? t("Agent.noSharedAgents")
                    : t("Agent.noAvailableAgents")}
                </CardTitle>
                <CardDescription>
                  {canCreate
                    ? t("Agent.noSharedAgentsDescription")
                    : t("Agent.noAvailableAgentsDescription")}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>

      {/* Void Cyber Predefined Agents Section (shown whenever Cyber agents exist) */}
      {cyberAgents.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-lg font-semibold">Void Cyber Agents</h2>
            <div className="flex-1 h-px bg-border" />
            <Link href="/cyber/agents">
              <Button variant="ghost" size="sm">
                <Plus className="size-3.5" />
                Manage Cyber Agents
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cyberAgents.map((agent) => {
              const isMine = !agent.isBuiltin && agent.userId === userId;
              const openHref =
                agent.openHref ??
                `/cyber?agentId=${encodeURIComponent(agent.id)}`;
              const editHref =
                agent.editHref !== undefined
                  ? agent.editHref
                  : isMine
                    ? "/cyber/agents"
                    : null;
              return (
                <Card
                  key={agent.id}
                  className="flex flex-col justify-between hover:border-cyan-500/40 transition-colors"
                >
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center size-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                          <Shield className="size-3.5" />
                        </span>
                        <CardTitle className="text-base truncate">
                          {agent.name}
                        </CardTitle>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25 shrink-0">
                        {agent.isBuiltin
                          ? "Built-in Cyber"
                          : agent.isShared && !isMine
                            ? "Shared Cyber"
                            : "Cyber"}
                      </span>
                    </div>
                    <CardDescription className="line-clamp-2 text-xs">
                      {agent.description ||
                        "Predefined Void Cyber specialist agent."}
                    </CardDescription>
                  </CardHeader>
                  <div className="px-6 pb-4 flex items-center justify-between gap-2">
                    <Link href={openHref}>
                      <Button variant="secondary" size="sm">
                        Open in Cyber
                        <ArrowUpRight className="size-3.5" />
                      </Button>
                    </Link>
                    <div className="flex items-center gap-1">
                      {editHref && (
                        <Link href={editHref}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      )}
                      {isMine && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingCyberId === agent.id}
                          onClick={() => deleteCyberAgent(agent.id)}
                          aria-label={`Delete ${agent.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
