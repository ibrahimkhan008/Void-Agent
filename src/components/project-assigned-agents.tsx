"use client";

import { Bot, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "ui/button";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  icon: unknown;
};
type AgentResponse = {
  agents: Array<Agent & { agentId: string; createdAt: string }>;
  availableAgents: Agent[];
};

export function ProjectAssignedAgents({
  projectId,
  isTeamProject,
}: {
  projectId: string;
  isTeamProject: boolean;
}) {
  const [data, setData] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/agents`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load project agents");
      setData((await response.json()) as AgentResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load project agents",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const toggle = async (agentId: string) => {
    const attached = data?.agents.some((agent) => agent.agentId === agentId);
    setBusyId(agentId);
    setError(null);
    try {
      const response = await fetch(
        attached
          ? `/api/projects/${projectId}/agents?agentId=${encodeURIComponent(agentId)}`
          : `/api/projects/${projectId}/agents`,
        attached
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId }),
            },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Could not update project agents");
      }
      await refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update project agents",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading agents…
      </p>
    );
  return (
    <section aria-label="Project agents" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {isTeamProject
          ? "Team projects can use public agents so every project member sees the same assignment. Private agents are not shared with the team."
          : "Attach agents you own or agents marked public. Assignments are saved immediately."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data?.availableAgents.length ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Bot className="mx-auto mb-2 size-7" />
          {isTeamProject
            ? "No public agents are available. Publish an agent or use the agent gallery first."
            : "No accessible agents are available. Create an agent or use the agent gallery first."}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.availableAgents.map((agent) => {
            const attached = data.agents.some(
              (item) => item.agentId === agent.id,
            );
            return (
              <li
                key={agent.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  {agent.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {agent.description}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={attached ? "secondary" : "outline"}
                  disabled={busyId === agent.id}
                  onClick={() => void toggle(agent.id)}
                >
                  {busyId === agent.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : attached ? (
                    <X className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {attached ? "Remove" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {data?.agents.length ? (
        <p className="text-xs text-muted-foreground">
          {data.agents.length} agent(s) assigned.
        </p>
      ) : null}
    </section>
  );
}
