"use client";

import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import { fetcher } from "lib/utils";
import { useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import { Input } from "ui/input";
import {
  type ProjectBrainPageDetail,
  ProjectBrainPageDetailPanel,
} from "./project-brain-page-detail";
import { ProjectBrainStatusCard } from "./project-brain-status-card";
import { ProjectBrainTimeline } from "./project-brain-timeline";

type Source = {
  itemId: string;
  collectionId: string;
  filename: string | null;
  sourceUrl: string | null;
  status: string;
};
type Fact = {
  id: string;
  sourceItemId: string;
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
  confidence: number;
  reviewStatus: "proposed" | "accepted" | "rejected";
};
type BrainData = {
  sources: Source[];
  facts: Fact[];
  runs: Array<{ id: string; sourceItemId: string; status: string }>;
  sourceVersions?: Array<{
    id: string;
    sourceItemId: string;
    contentLength: number;
    snapshotAvailable: boolean;
    createdAt: string;
  }>;
  todos: Array<{
    id: string;
    sourceItemId: string;
    title: string;
    details: string;
    evidence: string;
    dueDate: string | null;
    status: "proposed" | "accepted" | "rejected" | "completed";
    createdAt: string;
    reviewedAt: string | null;
  }>;
  consolidatedTodos: Array<{
    id: string;
    title: string;
    details: string;
    dueDate: string | null;
    status: "accepted" | "completed";
    taskIds: string[];
    sourceCount: number;
    evidence: Array<{
      todoId: string;
      sourceItemId: string;
      quote: string;
    }>;
  }>;
};
type ConnectorData = {
  connectors: Array<{
    id: string;
    mcpServerId: string;
    collectionId: string;
    displayName: string;
    toolNames: string[];
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
    canSync: boolean;
  }>;
  servers: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
};
type ComposioData = {
  composioConfigured: boolean;
  accounts: Array<{ id: string; toolkitSlug: string; displayName: string }>;
  collections: Array<{ id: string; name: string }>;
  connectors: Array<{
    id: string;
    collectionId: string;
    toolkitSlug: string;
    connectedAccountId: string;
    displayName: string;
    readActionSlugs: string[];
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
    canSync: boolean;
  }>;
};
type GraphData = {
  nodes: Array<{ id: string; label: string; factCount: number }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    reviewStatus: string;
  }>;
  contradictions: Array<{ first: Fact; second: Fact }>;
  reviewedContradictions?: Array<{
    id: string;
    first: Fact;
    second: Fact;
    explanation: string | null;
  }>;
};
type ConflictHistoryData = {
  history: Array<{
    id: string;
    status: string;
    verdict: string;
    explanation: string | null;
    keptFactId: string | null;
    updatedAt: string;
    first: Fact & {
      filename: string | null;
      sourceVersionId: string;
      sourceVersionCreatedAt: string;
    };
    second: Fact & {
      filename: string | null;
      sourceVersionId: string;
      sourceVersionCreatedAt: string;
    };
  }>;
};
type BrainPagesData = {
  pages: Array<{
    id: string;
    title: string;
    entityType: string;
    normalizedTitle: string;
    salience: number;
    aliases: string[];
  }>;
  duplicateCandidates: Array<{
    firstPageId: string;
    secondPageId: string;
    firstTitle: string;
    secondTitle: string;
    entityType: string;
    score: number;
    reason: "shared-alias" | "alias-title-match" | "similar-title";
  }>;
  stalePages: Array<{
    id: string;
    title: string;
    entityType: string;
    updatedAt: string;
  }>;
  restorablePages: Array<{
    id: string;
    title: string;
    entityType: string;
    archivedAt: string;
  }>;
};
type BrainEntityPageDetailData = { detail: ProjectBrainPageDetail | null };
type BrainDreamData = {
  runs: Array<{
    id: string;
    canRetry: boolean;
    status: string;
    stage: string;
    metrics: Record<
      string,
      {
        suggestions?: Array<{
          firstPageId: string;
          secondPageId: string;
          firstTitle: string;
          secondTitle: string;
          verdict: string;
          explanation: string;
        }>;
        [key: string]: unknown;
      }
    >;
    warnings: string[];
    errorMessage: string | null;
    createdAt: string;
  }>;
};
type NodeDetailData = {
  detail: null | {
    node: { id: string; label: string; factCount: number };
    aliases: string[];
    facts: Array<
      Fact & {
        filename: string | null;
        sourceUrl: string | null;
        collectionId: string;
      }
    >;
    neighbors: Array<{ id: string; label: string; factCount: number }>;
  };
};
type BrainPath = {
  nodes: Array<{ id: string; label: string; factCount: number }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    reviewStatus: string;
  }>;
};
type BrainExpert = {
  id: string;
  label: string;
  score: number;
  connections: Array<
    Fact & {
      filename: string | null;
      sourceUrl: string | null;
      collectionId: string;
    }
  >;
};

export function ProjectBrainPanel({
  projectId,
  canReview,
}: {
  projectId: string;
  canReview: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<BrainData>(
    `/api/projects/${projectId}/brain`,
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 0,
      refreshInterval: (latest) =>
        latest?.runs.some(
          (run) => run.status === "queued" || run.status === "running",
        )
          ? 2500
          : 0,
    },
  );
  const { data: connectorData, mutate: mutateConnectors } =
    useSWR<ConnectorData>(
      `/api/projects/${projectId}/brain/connectors`,
      fetcher,
      { revalidateOnFocus: false, errorRetryCount: 0 },
    );
  const { data: composioData, mutate: mutateComposio } = useSWR<ComposioData>(
    `/api/projects/${projectId}/brain/composio`,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 0 },
  );
  const sources = data?.sources ?? [];
  const facts = data?.facts ?? [];
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEntityPageId, setSelectedEntityPageId] = useState<
    string | null
  >(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [graphPath, setGraphPath] = useState<BrainPath | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [expertQuery, setExpertQuery] = useState("");
  const [experts, setExperts] = useState<BrainExpert[] | null>(null);
  const [expertsLoading, setExpertsLoading] = useState(false);
  const [selectedMergePageIds, setSelectedMergePageIds] = useState<string[]>(
    [],
  );
  const [isMergingPages, setIsMergingPages] = useState(false);
  const [isRefreshingSalience, setIsRefreshingSalience] = useState(false);
  const [busyArchivePageId, setBusyArchivePageId] = useState<string | null>(
    null,
  );
  const [isScanningConflicts, setIsScanningConflicts] = useState(false);
  const [comparingPagePair, setComparingPagePair] = useState<string | null>(
    null,
  );
  const [dedupeJudgments, setDedupeJudgments] = useState<
    Record<string, { verdict: string; explanation: string }>
  >({});
  const [revisionPreview, setRevisionPreview] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [loadingRevisionId, setLoadingRevisionId] = useState<string | null>(
    null,
  );
  const [selectedMcpServer, setSelectedMcpServer] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [connectorBusy, setConnectorBusy] = useState<string | null>(null);
  const [mcpArguments, setMcpArguments] = useState<Record<string, string>>({});
  const [selectedComposioAccount, setSelectedComposioAccount] = useState("");
  const [composioArguments, setComposioArguments] = useState<
    Record<string, string>
  >({});
  const { data: graphData, mutate: mutateGraph } = useSWR<GraphData>(
    `/api/projects/${projectId}/brain/graph${focusedNodeId ? `?focus=${encodeURIComponent(focusedNodeId)}&depth=2` : ""}`,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 0 },
  );
  const { data: conflictHistoryData, mutate: mutateConflictHistory } =
    useSWR<ConflictHistoryData>(
      `/api/projects/${projectId}/brain/contradictions?history=true`,
      fetcher,
      { revalidateOnFocus: false, errorRetryCount: 0 },
    );
  const { data: brainPagesData, mutate: mutateBrainPages } =
    useSWR<BrainPagesData>(`/api/projects/${projectId}/brain/pages`, fetcher, {
      revalidateOnFocus: false,
      errorRetryCount: 0,
    });
  const {
    data: entityPageDetailData,
    isLoading: entityPageDetailLoading,
    error: entityPageDetailError,
    mutate: mutateEntityPageDetail,
  } = useSWR<BrainEntityPageDetailData>(
    selectedEntityPageId
      ? `/api/projects/${projectId}/brain/pages/${selectedEntityPageId}`
      : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 0 },
  );
  const { data: dreamData, mutate: mutateDream } = useSWR<BrainDreamData>(
    `/api/projects/${projectId}/brain/dream`,
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 0,
      refreshInterval: (value) =>
        value?.runs.some(
          (run) => run.status === "queued" || run.status === "running",
        )
          ? 2500
          : 0,
    },
  );
  const [startingDream, setStartingDream] = useState(false);
  const startBrainDream = async (retryRunId?: string) => {
    setStartingDream(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/brain/dream`, {
        method: "POST",
        ...(retryRunId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ retryRunId }),
            }
          : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || "Could not start the brain cycle");
      toast.success(
        payload.deduplicated
          ? "A brain cycle is already queued"
          : retryRunId
            ? "Project brain cycle retry queued"
            : "Project brain cycle queued",
      );
      await mutateDream();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not start the brain cycle",
      );
    } finally {
      setStartingDream(false);
    }
  };
  const {
    data: nodeDetailData,
    error: nodeDetailError,
    isLoading: nodeDetailLoading,
  } = useSWR<NodeDetailData>(
    selectedNodeId
      ? `/api/projects/${projectId}/brain/graph/nodes/${encodeURIComponent(selectedNodeId)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 0 },
  );
  const graphNodes = useMemo<Node[]>(
    () =>
      (graphData?.nodes ?? []).map((node, index) => ({
        id: node.id,
        position: { x: (index % 3) * 230, y: Math.floor(index / 3) * 130 },
        data: { label: node.label },
      })),
    [graphData?.nodes],
  );
  const graphEdges = useMemo<Edge[]>(
    () =>
      (graphData?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.reviewStatus === "proposed",
        labelStyle: { fontSize: 11 },
      })),
    [graphData?.edges],
  );
  const selectedMergePages = selectedMergePageIds
    .map((id) => brainPagesData?.pages.find((page) => page.id === id))
    .filter((page): page is NonNullable<typeof page> => Boolean(page));

  const analyze = async (itemId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/brain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Analysis failed");
      const result = await response.json();
      toast.success(
        result.status === "queued" || result.status === "running"
          ? result.reused
            ? "Source analysis is already queued"
            : "Source analysis queued"
          : "Existing analysis loaded",
      );
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not analyze source",
      );
    }
  };

  const review = async (factId: string, status: "accepted" | "rejected") => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/facts/${factId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Review failed");
      await Promise.all([
        mutate(),
        mutateGraph(),
        mutateBrainPages(),
        mutateEntityPageDetail(),
      ]);
      toast.success(status === "accepted" ? "Fact accepted" : "Fact dismissed");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update fact",
      );
      return false;
    }
  };

  const reviewEntityPageFact = (
    factId: string,
    status: "accepted" | "rejected",
  ) => {
    void review(factId, status);
  };

  const reviewTodo = async (
    todoId: string,
    status: "accepted" | "rejected" | "completed",
  ) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/todos/${todoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ??
            "Task update failed",
        );
      await mutate();
      toast.success(
        status === "accepted"
          ? "Task accepted"
          : status === "rejected"
            ? "Task dismissed"
            : "Task completed",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update task",
      );
    }
  };

  const completeConsolidatedTodo = async (todoIds: string[]) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/todos/consolidated`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todoIds }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error ?? "Could not complete project task");
      await mutate();
      toast.success("Matching source tasks marked complete");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not complete project task",
      );
    }
  };

  const resolveConflict = async (
    firstFactId: string,
    secondFactId: string,
    keepFactId?: string,
    action: "keep" | "dismiss" = "keep",
  ) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/contradictions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstFactId,
            secondFactId,
            keepFactId,
            action,
          }),
        },
      );
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Resolution failed");
      await Promise.all([mutate(), mutateGraph()]);
      toast.success(
        action === "dismiss"
          ? "Conflict dismissed"
          : "Potential conflict resolved",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resolve conflict",
      );
    }
  };

  const scanProjectConflicts = async () => {
    setIsScanningConflicts(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/contradictions`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        classified?: number;
        contradictions?: number;
        compatible?: number;
        unknown?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Conflict scan failed");
      await Promise.all([mutateGraph(), mutateConflictHistory()]);
      toast.success(
        `Reviewed ${payload.classified ?? 0} claim pairs: ${payload.contradictions ?? 0} conflicts, ${payload.compatible ?? 0} compatible, ${payload.unknown ?? 0} uncertain`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not scan conflicts",
      );
    } finally {
      setIsScanningConflicts(false);
    }
  };

  const findPath = async () => {
    setPathLoading(true);
    setGraphPath(null);
    try {
      const params = new URLSearchParams({ from: pathStart, to: pathEnd });
      const response = await fetch(
        `/api/projects/${projectId}/brain/graph?${params}`,
      );
      const payload = (await response.json()) as {
        path?: BrainPath;
        error?: string;
      };
      if (!response.ok || !payload.path)
        throw new Error(payload.error ?? "Path lookup failed");
      setGraphPath(payload.path);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not find a graph path",
      );
    } finally {
      setPathLoading(false);
    }
  };

  const findPeopleConnectedToTopic = async () => {
    setExpertsLoading(true);
    setExperts(null);
    try {
      const params = new URLSearchParams({ whoKnows: expertQuery });
      const response = await fetch(
        `/api/projects/${projectId}/brain/graph?${params}`,
      );
      const payload = (await response.json()) as {
        experts?: BrainExpert[];
        error?: string;
      };
      if (!response.ok || !payload.experts)
        throw new Error(payload.error ?? "Expert lookup failed");
      setExperts(payload.experts);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not find connected people",
      );
    } finally {
      setExpertsLoading(false);
    }
  };

  const mergeSelectedPages = async () => {
    if (
      selectedMergePages.length !== 2 ||
      selectedMergePages[0]?.entityType !== selectedMergePages[1]?.entityType
    )
      return;
    const [survivor, merged] = selectedMergePages;
    if (
      !window.confirm(
        `Merge “${merged!.title}” into “${survivor!.title}”? Its page ID will remain as an archived redirect.`,
      )
    )
      return;
    setIsMergingPages(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/brain/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorPageId: survivor!.id,
          mergedPageId: merged!.id,
        }),
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Page merge failed");
      toast.success(
        payload.status === "already-merged"
          ? "These pages were already merged"
          : "Pages merged",
      );
      setSelectedMergePageIds([]);
      await Promise.all([mutateBrainPages(), mutateGraph(), mutate()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not merge pages",
      );
    } finally {
      setIsMergingPages(false);
    }
  };

  const refreshSalience = async () => {
    setIsRefreshingSalience(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/salience`,
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as {
        updated?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Refresh failed");
      await mutateBrainPages();
      toast.success(
        `Graph ranking refreshed (${payload.updated ?? 0} pages updated)`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not refresh graph ranking",
      );
    } finally {
      setIsRefreshingSalience(false);
    }
  };

  const reviewDuplicateCandidate = (
    firstPageId: string,
    secondPageId: string,
  ) => {
    setSelectedMergePageIds([firstPageId, secondPageId]);
  };

  const compareDuplicateCandidate = async (
    firstPageId: string,
    secondPageId: string,
  ) => {
    const pairKey = [firstPageId, secondPageId].sort().join(":");
    setComparingPagePair(pairKey);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/pages/dedupe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs: [{ firstPageId, secondPageId }] }),
        },
      );
      const payload = (await response.json()) as {
        results?: Array<{ verdict: string; explanation: string }>;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Could not compare pages");
      const judgment = payload.results?.[0];
      if (!judgment) throw new Error("No comparison result was returned");
      setDedupeJudgments((current) => ({ ...current, [pairKey]: judgment }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not compare pages",
      );
    } finally {
      setComparingPagePair(null);
    }
  };

  const dismissDuplicateCandidate = async (
    firstPageId: string,
    secondPageId: string,
  ) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/brain/pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "not_same", firstPageId, secondPageId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save review");
      await mutateBrainPages();
      toast.success(
        "These identities will no longer be suggested as duplicates",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save page review",
      );
    }
  };

  const setPageArchived = async (
    action: "archive_stale" | "restore",
    pageId: string,
  ) => {
    if (
      action === "archive_stale" &&
      !window.confirm(
        "Archive this stale identity page? Its facts are preserved and the page can be restored when a current accepted source claim exists.",
      )
    )
      return;
    setBusyArchivePageId(pageId);
    try {
      const response = await fetch(`/api/projects/${projectId}/brain/pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, pageId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Page update failed");
      await Promise.all([mutateBrainPages(), mutateGraph(), mutate()]);
      toast.success(action === "restore" ? "Page restored" : "Page archived");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update page",
      );
    } finally {
      setBusyArchivePageId(null);
    }
  };

  const attachMcpSource = async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/connectors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mcpServerId: selectedMcpServer,
            collectionId: selectedCollection,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not attach MCP source");
      await mutateConnectors();
      toast.success("Read-only MCP source attached");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not attach MCP source",
      );
    }
  };

  const syncMcpTool = async (connectorId: string, toolName: string) => {
    const key = `${connectorId}:${toolName}`;
    setConnectorBusy(key);
    try {
      const args = JSON.parse(mcpArguments[key] || "{}") as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Tool arguments must be a JSON object");
      const response = await fetch(
        `/api/projects/${projectId}/brain/connectors/${connectorId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ calls: [{ toolName, arguments: args }] }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "MCP sync failed");
      await Promise.all([mutateConnectors(), mutate()]);
      toast.success(
        "MCP source synced; project knowledge extraction is queued",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MCP sync failed");
    } finally {
      setConnectorBusy(null);
    }
  };

  const detachMcpSource = async (connectorId: string) => {
    if (
      !window.confirm(
        "Detach this MCP source and delete its synced project knowledge?",
      )
    )
      return;
    setConnectorBusy(connectorId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/connectors/${connectorId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not detach MCP source");
      await Promise.all([mutateConnectors(), mutate()]);
      toast.success("MCP source detached and synced knowledge removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not detach MCP source",
      );
    } finally {
      setConnectorBusy(null);
    }
  };

  const attachComposioSource = async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/composio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectedAccountId: selectedComposioAccount,
            collectionId: selectedCollection,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not attach Composio source");
      await mutateComposio();
      toast.success("Composio read-only source attached");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not attach Composio source",
      );
    }
  };

  const syncComposioAction = async (
    connectorId: string,
    actionSlug: string,
  ) => {
    const key = `composio:${connectorId}:${actionSlug}`;
    setConnectorBusy(key);
    try {
      const args = JSON.parse(composioArguments[key] || "{}") as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Action arguments must be a JSON object");
      const response = await fetch(
        `/api/projects/${projectId}/brain/composio/${connectorId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ calls: [{ actionSlug, arguments: args }] }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Composio sync failed");
      await Promise.all([mutateComposio(), mutate()]);
      toast.success(
        "Composio source synced; project knowledge extraction is queued",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Composio sync failed",
      );
    } finally {
      setConnectorBusy(null);
    }
  };

  const gatherComposioSource = async (connectorId: string) => {
    const key = `composio:${connectorId}:gather`;
    setConnectorBusy(key);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/composio/${connectorId}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ mode: "gather" }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Composio sync failed");
      await Promise.all([mutateComposio(), mutate()]);
      toast.success(
        "Relevant Composio data gathered; project knowledge extraction is queued",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Composio sync failed",
      );
    } finally {
      setConnectorBusy(null);
    }
  };

  const detachComposioSource = async (connectorId: string) => {
    if (
      !window.confirm(
        "Detach this Composio source and delete its synced project knowledge?",
      )
    )
      return;
    setConnectorBusy(`composio:${connectorId}`);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/composio/${connectorId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not detach Composio source");
      await Promise.all([mutateComposio(), mutate()]);
      toast.success("Composio source detached and synced knowledge removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not detach Composio source",
      );
    } finally {
      setConnectorBusy(null);
    }
  };

  const viewSourceRevision = async (versionId: string) => {
    if (revisionPreview?.id === versionId) {
      setRevisionPreview(null);
      return;
    }
    setLoadingRevisionId(versionId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/brain/versions/${versionId}`,
      );
      const payload = (await response.json()) as {
        content?: string;
        error?: string;
      };
      if (!response.ok || typeof payload.content !== "string") {
        throw new Error(
          payload.error ?? "Could not load saved source revision",
        );
      }
      setRevisionPreview({ id: versionId, content: payload.content });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load saved source revision",
      );
    } finally {
      setLoadingRevisionId(null);
    }
  };

  return (
    <section
      className="mt-5 border-t pt-4"
      aria-label="Project knowledge brain"
    >
      <ProjectBrainStatusCard projectId={projectId} canReview={canReview} />
      <ProjectBrainTimeline projectId={projectId} canReview={canReview} />
      <div className="mb-5 rounded-md border p-3">
        <h3 className="font-medium">Read-only MCP knowledge sources</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Only tools explicitly marked read-only by the MCP server can be
          attached. Sync results become source documents and all extracted
          claims require review.
        </p>
        {canReview &&
          (connectorData?.servers.length ?? 0) > 0 &&
          (connectorData?.collections.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                aria-label="MCP server"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={selectedMcpServer}
                onChange={(event) => setSelectedMcpServer(event.target.value)}
              >
                <option value="">Choose your MCP server</option>
                {connectorData?.servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Attached knowledge collection"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={selectedCollection}
                onChange={(event) => setSelectedCollection(event.target.value)}
              >
                <option value="">Choose attached collection</option>
                {connectorData?.collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedMcpServer || !selectedCollection}
                onClick={() => void attachMcpSource()}
              >
                Attach source
              </Button>
            </div>
          )}
        {(connectorData?.connectors ?? []).map((connector) => (
          <div key={connector.id} className="mt-3 rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <strong>{connector.displayName}</strong>
              <span className="text-xs text-muted-foreground">
                {connector.lastSyncAt
                  ? `Last synced ${new Date(connector.lastSyncAt).toLocaleString()}`
                  : "Not synced"}
                {connector.lastError ? ` · ${connector.lastError}` : ""}
              </span>
              {canReview && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connectorBusy === connector.id}
                  onClick={() => void detachMcpSource(connector.id)}
                >
                  Detach
                </Button>
              )}
            </div>
            {connector.toolNames.map((toolName) => {
              const key = `${connector.id}:${toolName}`;
              return (
                <div
                  key={toolName}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <label className="text-xs">
                    {toolName} arguments (JSON object)
                    <textarea
                      className="mt-1 min-h-16 w-full rounded-md border bg-background p-2 font-mono text-xs"
                      aria-label={`${toolName} arguments`}
                      value={mcpArguments[key] ?? "{}"}
                      onChange={(event) =>
                        setMcpArguments((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {canReview && connector.canSync && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={connectorBusy !== null}
                      onClick={() => void syncMcpTool(connector.id, toolName)}
                    >
                      {connectorBusy === key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCw className="mr-1 size-3.5" />
                      )}{" "}
                      Sync tool
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mb-5 rounded-md border p-3">
        <h3 className="font-medium">Composio knowledge sources</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Only read actions with safe read-oriented slugs are offered. The
          connected-account owner must initiate every sync.
        </p>
        {canReview &&
          (composioData?.accounts.length ?? 0) > 0 &&
          (composioData?.collections.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                aria-label="Composio connected account"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={selectedComposioAccount}
                onChange={(event) =>
                  setSelectedComposioAccount(event.target.value)
                }
              >
                <option value="">Choose connected account</option>
                {composioData?.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>
              <select
                aria-label="Composio attached collection"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={selectedCollection}
                onChange={(event) => setSelectedCollection(event.target.value)}
              >
                <option value="">Choose attached collection</option>
                {composioData?.collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedComposioAccount || !selectedCollection}
                onClick={() => void attachComposioSource()}
              >
                Attach Composio
              </Button>
            </div>
          )}
        {!composioData?.composioConfigured && (
          <p className="mt-2 text-xs text-muted-foreground">
            Composio is not configured on this server.
          </p>
        )}
        {(composioData?.connectors ?? []).map((connector) => (
          <div key={connector.id} className="mt-3 rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <strong>{connector.displayName}</strong>
              <span className="text-xs text-muted-foreground">
                {connector.lastSyncAt
                  ? `Last synced ${new Date(connector.lastSyncAt).toLocaleString()}`
                  : "Not synced"}
                {connector.lastError ? ` · ${connector.lastError}` : ""}
              </span>
              {canReview && (
                <div className="flex gap-2">
                  {connector.canSync && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={connectorBusy !== null}
                      onClick={() => void gatherComposioSource(connector.id)}
                    >
                      {connectorBusy === `composio:${connector.id}:gather` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCw className="mr-1 size-3.5" />
                      )}{" "}
                      Gather relevant data
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={connectorBusy !== null}
                    onClick={() => void detachComposioSource(connector.id)}
                  >
                    Detach
                  </Button>
                </div>
              )}
            </div>
            {connector.readActionSlugs.map((actionSlug) => {
              const key = `composio:${connector.id}:${actionSlug}`;
              return (
                <div
                  key={actionSlug}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <label className="text-xs">
                    {actionSlug} arguments (JSON object)
                    <textarea
                      className="mt-1 min-h-16 w-full rounded-md border bg-background p-2 font-mono text-xs"
                      aria-label={`${actionSlug} arguments`}
                      value={composioArguments[key] ?? "{}"}
                      onChange={(event) =>
                        setComposioArguments((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {canReview && connector.canSync && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={connectorBusy !== null}
                      onClick={() =>
                        void syncComposioAction(connector.id, actionSlug)
                      }
                    >
                      {connectorBusy === key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCw className="mr-1 size-3.5" />
                      )}{" "}
                      Sync action
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <h3 className="font-medium">Source analysis</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Analyze documents already in this project’s attached collections.
        Extracted claims remain proposals until a workspace member reviews them.
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Loading project sources…
        </p>
      ) : error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not load project sources.
        </p>
      ) : sources.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No sources in the attached collections yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sources.map((source) => {
            const run = data?.runs.find(
              (entry) => entry.sourceItemId === source.itemId,
            );
            const revisions =
              data?.sourceVersions?.filter(
                (entry) => entry.sourceItemId === source.itemId,
              ) ?? [];
            return (
              <li
                key={source.itemId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {source.filename ||
                    source.sourceUrl ||
                    `Source ${source.itemId.slice(0, 8)}`}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {source.status}
                    {run ? ` · brain ${run.status}` : ""}
                    {revisions.length > 0
                      ? ` · ${revisions.length} recorded revision${revisions.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !canReview ||
                    source.status !== "ready" ||
                    run?.status === "queued" ||
                    run?.status === "running"
                  }
                  onClick={() => void analyze(source.itemId)}
                >
                  <RotateCw className="mr-1 size-3.5" />
                  Analyze
                </Button>
                {revisions.length > 0 && (
                  <div className="basis-full border-t pt-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Source revision history
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {revisions.map((revision) => (
                        <li key={revision.id}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto px-1 py-0.5 text-xs"
                            disabled={
                              !revision.snapshotAvailable ||
                              loadingRevisionId === revision.id
                            }
                            aria-expanded={revisionPreview?.id === revision.id}
                            onClick={() => void viewSourceRevision(revision.id)}
                          >
                            {revision.snapshotAvailable
                              ? `View ${new Date(revision.createdAt).toLocaleString()} · ${revision.contentLength.toLocaleString()} chars`
                              : `Historical revision · ${new Date(revision.createdAt).toLocaleString()} (content unavailable)`}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {revisionPreview &&
                      revisions.some(
                        (revision) => revision.id === revisionPreview.id,
                      ) && (
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
                          {revisionPreview.content}
                        </pre>
                      )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {facts.length > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium">Extracted claims</h4>
          {facts.map((fact) => {
            const source = sources.find(
              (entry) => entry.itemId === fact.sourceItemId,
            );
            return (
              <article key={fact.id} className="rounded-md border p-3 text-sm">
                <p>
                  <strong>{fact.subject}</strong> {fact.predicate}{" "}
                  <strong>{fact.object}</strong>
                </p>
                <blockquote className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
                  {fact.evidence}
                </blockquote>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {fact.reviewStatus} · {Math.round(fact.confidence * 100)}%
                    model confidence · {source?.filename || "Source"}
                    {source && (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/knowledge/${source.collectionId}`}
                          className="underline"
                        >
                          Open source
                        </Link>
                      </>
                    )}
                  </span>
                  {canReview && fact.reviewStatus === "proposed" && (
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Accept fact"
                        onClick={() => void review(fact.id, "accepted")}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Dismiss fact"
                        onClick={() => void review(fact.id, "rejected")}
                      >
                        <X className="size-4" />
                      </Button>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {(data?.consolidatedTodos.length ?? 0) > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium">Unified project task list</h4>
          <p className="text-xs text-muted-foreground">
            Exact title and detail matches are grouped across accepted source
            proposals. Evidence remains attached to each source; completing a
            group updates all its currently visible matching proposals.
          </p>
          {data?.consolidatedTodos.map((todo) => (
            <article key={todo.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h5 className="font-medium">{todo.title}</h5>
                  {todo.details && (
                    <p className="mt-1 text-muted-foreground">{todo.details}</p>
                  )}
                </div>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">
                  {todo.status === "completed" ? "completed" : "open"}
                </span>
              </div>
              {todo.dueDate && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Due {todo.dueDate}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Supported by {todo.sourceCount} source
                {todo.sourceCount === 1 ? "" : "s"}
                {todo.sourceCount > todo.evidence.length &&
                  "; showing the 10 most recent evidence excerpts"}
              </p>
              <ul className="mt-2 space-y-2">
                {todo.evidence.map((evidence) => {
                  const source = sources.find(
                    (entry) => entry.itemId === evidence.sourceItemId,
                  );
                  return (
                    <li
                      key={evidence.todoId}
                      className="border-l-2 pl-3 text-xs text-muted-foreground"
                    >
                      <blockquote>{evidence.quote}</blockquote>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Source: {source?.filename || "Document"}</span>
                        {source && (
                          <Link
                            href={`/knowledge/${source.collectionId}`}
                            className="underline"
                          >
                            Open source
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {canReview && todo.status === "accepted" && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => void completeConsolidatedTodo(todo.taskIds)}
                >
                  Complete matching tasks
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {(data?.todos.filter(
        (todo) => todo.status === "proposed" || todo.status === "rejected",
      ).length ?? 0) > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium">Source task proposals</h4>
          <p className="text-xs text-muted-foreground">
            Extracted tasks are proposals. Editors must review them before they
            become project tasks.
          </p>
          {data?.todos
            .filter(
              (todo) =>
                todo.status === "proposed" || todo.status === "rejected",
            )
            .map((todo) => {
              const source = sources.find(
                (entry) => entry.itemId === todo.sourceItemId,
              );
              return (
                <article
                  key={todo.id}
                  className="rounded-md border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h5 className="font-medium">{todo.title}</h5>
                      {todo.details && (
                        <p className="mt-1 text-muted-foreground">
                          {todo.details}
                        </p>
                      )}
                    </div>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {todo.status}
                    </span>
                  </div>
                  {todo.dueDate && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due {todo.dueDate}
                    </p>
                  )}
                  <blockquote className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">
                    {todo.evidence}
                  </blockquote>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Source: {source?.filename || "Document"}
                    </span>
                    {source && (
                      <Link
                        href={`/knowledge/${source.collectionId}`}
                        className="text-xs underline"
                      >
                        Open source
                      </Link>
                    )}
                    {canReview && todo.status === "proposed" && (
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void reviewTodo(todo.id, "accepted")}
                        >
                          Accept task
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void reviewTodo(todo.id, "rejected")}
                        >
                          Dismiss
                        </Button>
                      </span>
                    )}
                    {canReview && todo.status === "accepted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void reviewTodo(todo.id, "completed")}
                      >
                        Mark complete
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
      {((brainPagesData?.pages.length ?? 0) > 0 ||
        (brainPagesData?.stalePages.length ?? 0) > 0 ||
        (brainPagesData?.restorablePages.length ?? 0) > 0) && (
        <div className="mt-5 space-y-2">
          {(brainPagesData?.pages.length ?? 0) > 0 && (
            <>
              <h4 className="text-sm font-medium">Accepted entity pages</h4>
              <p className="text-xs text-muted-foreground">
                Stable, project-scoped identities built from accepted source
                claims. A shared label can still represent multiple typed
                entities.
              </p>
            </>
          )}
          {((brainPagesData?.stalePages.length ?? 0) > 0 ||
            (brainPagesData?.restorablePages.length ?? 0) > 0) && (
            <div className="space-y-2 rounded-md border p-3">
              <h5 className="text-sm font-medium">Stale page cleanup</h5>
              <p className="text-xs text-muted-foreground">
                Stale pages have no current accepted identity claim and have not
                been updated in 30 days. Archiving hides the identity record but
                keeps its facts; a later source analysis can make it eligible
                for restoration.
              </p>
              {brainPagesData?.stalePages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {page.title}{" "}
                    <span className="text-xs text-muted-foreground">
                      {page.entityType}
                    </span>
                  </span>
                  {canReview && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyArchivePageId === page.id}
                      onClick={() =>
                        void setPageArchived("archive_stale", page.id)
                      }
                    >
                      {busyArchivePageId === page.id
                        ? "Archiving…"
                        : "Archive stale page"}
                    </Button>
                  )}
                </div>
              ))}
              {brainPagesData?.restorablePages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {page.title}{" "}
                    <span className="text-xs text-muted-foreground">
                      {page.entityType}
                    </span>
                  </span>
                  {canReview && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyArchivePageId === page.id}
                      onClick={() => void setPageArchived("restore", page.id)}
                    >
                      {busyArchivePageId === page.id
                        ? "Restoring…"
                        : "Restore page"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canReview && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Select two pages of the same type to review a merge. The first
                selection stays canonical.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={isRefreshingSalience}
                onClick={() => void refreshSalience()}
              >
                {isRefreshingSalience ? "Refreshing…" : "Refresh graph ranking"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  startingDream ||
                  dreamData?.runs.some(
                    (run) =>
                      run.status === "queued" || run.status === "running",
                  )
                }
                onClick={() => void startBrainDream()}
              >
                {startingDream ? "Queueing…" : "Run brain cycle"}
              </Button>
            </div>
          )}
          {(dreamData?.runs.length ?? 0) > 0 && (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <h5 className="font-medium text-foreground">
                Latest brain cycle
              </h5>
              {dreamData!.runs.slice(0, 1).map((run) => (
                <div key={run.id} className="mt-1 space-y-1">
                  <p>
                    {run.status} · {run.stage}
                    {run.errorMessage ? ` · ${run.errorMessage}` : ""}
                  </p>
                  {run.canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={startingDream}
                      onClick={() => void startBrainDream(run.id)}
                    >
                      {startingDream ? "Queueing retry…" : "Retry cycle"}
                    </Button>
                  )}
                  {Object.entries(run.metrics ?? {}).map(([stage, metrics]) => (
                    <div key={stage}>
                      <p>
                        {stage}:{" "}
                        {Object.entries(metrics)
                          .filter(([key]) => key !== "suggestions")
                          .map(([key, value]) => `${key} ${String(value)}`)
                          .join(" · ")}
                      </p>
                      {metrics.suggestions?.map((suggestion) => (
                        <div
                          key={`${suggestion.firstPageId}:${suggestion.secondPageId}`}
                          className="mt-1 flex flex-wrap items-center gap-2"
                        >
                          <span>
                            {suggestion.firstTitle} may match{" "}
                            {suggestion.secondTitle}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setSelectedMergePageIds([
                                suggestion.firstPageId,
                                suggestion.secondPageId,
                              ])
                            }
                          >
                            Review merge
                          </Button>
                          <span>{suggestion.explanation}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {run.warnings?.map((warning, index) => (
                    <p key={`${run.id}-${index}`} className="text-destructive">
                      {warning}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {(brainPagesData?.duplicateCandidates.length ?? 0) > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <h5 className="text-sm font-medium">
                  Possible duplicate identities
                </h5>
                <p className="text-xs text-muted-foreground">
                  Name and alias similarity is only a hint. Review the
                  source-backed pages before confirming any merge.
                </p>
              </div>
              <ul className="space-y-2">
                {brainPagesData?.duplicateCandidates.map((candidate) => (
                  <li
                    key={`${candidate.firstPageId}:${candidate.secondPageId}`}
                    className="space-y-2 rounded-sm text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {candidate.firstTitle} ↔ {candidate.secondTitle}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {candidate.entityType} ·{" "}
                          {candidate.reason.replaceAll("-", " ")}
                        </span>
                      </span>
                      {canReview && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={comparingPagePair !== null}
                            onClick={() =>
                              void compareDuplicateCandidate(
                                candidate.firstPageId,
                                candidate.secondPageId,
                              )
                            }
                          >
                            {comparingPagePair ===
                            [candidate.firstPageId, candidate.secondPageId]
                              .sort()
                              .join(":")
                              ? "Comparing…"
                              : "AI compare"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isMergingPages}
                            onClick={() =>
                              reviewDuplicateCandidate(
                                candidate.firstPageId,
                                candidate.secondPageId,
                              )
                            }
                          >
                            Review merge
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void dismissDuplicateCandidate(
                                candidate.firstPageId,
                                candidate.secondPageId,
                              )
                            }
                          >
                            Not duplicates
                          </Button>
                        </div>
                      )}
                    </div>
                    {dedupeJudgments[
                      [candidate.firstPageId, candidate.secondPageId]
                        .sort()
                        .join(":")
                    ] && (
                      <p className="text-xs text-muted-foreground">
                        Advisory AI judgment:{" "}
                        {dedupeJudgments[
                          [candidate.firstPageId, candidate.secondPageId]
                            .sort()
                            .join(":")
                        ]!.verdict.replaceAll("_", " ")}{" "}
                        —{" "}
                        {
                          dedupeJudgments[
                            [candidate.firstPageId, candidate.secondPageId]
                              .sort()
                              .join(":")
                          ]!.explanation
                        }{" "}
                        Review source evidence before merging.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {brainPagesData?.pages.map((page) => {
              const selected = selectedMergePageIds.includes(page.id);
              return (
                <li key={page.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {page.title}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        {page.entityType}
                      </span>
                    </p>
                    {canReview && (
                      <Button
                        size="sm"
                        variant={selected ? "secondary" : "outline"}
                        aria-pressed={selected}
                        disabled={!selected && selectedMergePageIds.length >= 2}
                        onClick={() =>
                          setSelectedMergePageIds((current) =>
                            selected
                              ? current.filter((id) => id !== page.id)
                              : [...current, page.id],
                          )
                        }
                      >
                        {selected ? "Selected" : "Select"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={selectedEntityPageId === page.id}
                      aria-controls={`brain-page-detail-${page.id}`}
                      onClick={() =>
                        setSelectedEntityPageId((current) =>
                          current === page.id ? null : page.id,
                        )
                      }
                    >
                      {selectedEntityPageId === page.id
                        ? "Hide details"
                        : "Details"}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Salience: {page.salience.toFixed(3)}
                  </p>
                  {page.aliases.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aliases: {page.aliases.join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {selectedEntityPageId && (
            <section
              id={`brain-page-detail-${selectedEntityPageId}`}
              className="space-y-3 rounded-md border p-3"
              aria-live="polite"
            >
              <ProjectBrainPageDetailPanel
                detail={entityPageDetailData?.detail}
                loading={entityPageDetailLoading}
                error={Boolean(entityPageDetailError)}
                canReview={canReview}
                revisionPreview={revisionPreview}
                loadingRevisionId={loadingRevisionId}
                onToggleRevision={(versionId) =>
                  void viewSourceRevision(versionId)
                }
                onReviewFact={(factId, status) =>
                  void reviewEntityPageFact(factId, status)
                }
              />
            </section>
          )}{" "}
          {canReview && selectedMergePages.length === 2 && (
            <Button
              size="sm"
              variant="outline"
              disabled={
                isMergingPages ||
                selectedMergePages[0]?.entityType !==
                  selectedMergePages[1]?.entityType
              }
              onClick={() => void mergeSelectedPages()}
            >
              {isMergingPages
                ? "Merging…"
                : `Merge ${selectedMergePages[1]?.title} into ${selectedMergePages[0]?.title}`}
            </Button>
          )}
        </div>
      )}
      {graphNodes.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">
              Knowledge graph{focusedNodeId ? " · Focused view" : ""}
            </h4>
            {focusedNodeId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFocusedNodeId(null)}
              >
                Show full graph
              </Button>
            )}
          </div>
          <div className="h-[360px] overflow-hidden rounded-md border">
            <ReactFlow
              key={focusedNodeId ?? "all"}
              nodes={graphNodes}
              edges={graphEdges}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              From entity
              <Input
                value={pathStart}
                onChange={(event) => setPathStart(event.target.value)}
                maxLength={160}
                placeholder="Entity name"
              />
            </label>
            <label className="grid gap-1 text-xs">
              To entity
              <Input
                value={pathEnd}
                onChange={(event) => setPathEnd(event.target.value)}
                maxLength={160}
                placeholder="Entity name"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!pathStart.trim() || !pathEnd.trim() || pathLoading}
              onClick={() => void findPath()}
            >
              {pathLoading ? "Finding…" : "Find relationship path"}
            </Button>
          </div>
          {graphPath && (
            <p className="mt-2 text-sm" aria-live="polite">
              {graphPath.nodes.length
                ? graphPath.nodes.map((node) => node.label).join(" → ")
                : "No accepted-claim path found within six steps."}
            </p>
          )}
          {selectedNodeId && (
            <div className="mt-3 rounded-md border p-3" aria-live="polite">
              {nodeDetailLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading node details…
                </p>
              ) : nodeDetailError ? (
                <p role="alert" className="text-sm text-destructive">
                  Could not load this node&apos;s details.
                </p>
              ) : nodeDetailData?.detail ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h5 className="font-medium">
                        {nodeDetailData.detail.node.label}
                      </h5>
                      <p className="text-xs text-muted-foreground">
                        {nodeDetailData.detail.node.factCount} visible claims
                      </p>
                    </div>
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFocusedNodeId(selectedNodeId)}
                      >
                        Explore connections
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedNodeId(null)}
                      >
                        Close
                      </Button>
                    </span>
                  </div>
                  {nodeDetailData.detail.aliases.length > 0 && (
                    <p className="mt-2 text-xs">
                      <span className="font-medium">Aliases: </span>
                      {nodeDetailData.detail.aliases.join(", ")}
                    </p>
                  )}
                  {nodeDetailData.detail.neighbors.length > 0 && (
                    <p className="mt-2 text-xs">
                      <span className="font-medium">Related: </span>
                      {nodeDetailData.detail.neighbors
                        .map((neighbor) => neighbor.label)
                        .join(", ")}
                    </p>
                  )}
                  <ul className="mt-3 space-y-2">
                    {nodeDetailData.detail.facts.map((fact) => (
                      <li key={fact.id} className="rounded border p-2 text-sm">
                        <p>
                          <strong>{fact.subject}</strong> {fact.predicate}{" "}
                          <strong>{fact.object}</strong>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {fact.reviewStatus}
                          </span>
                        </p>
                        <blockquote className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">
                          {fact.evidence}
                        </blockquote>
                        <Link
                          href={`/knowledge/${fact.collectionId}`}
                          className="mt-1 inline-block text-xs underline"
                        >
                          {fact.filename ||
                            fact.sourceUrl ||
                            "Open source collection"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This node is no longer available from the project&apos;s
                  current sources.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {graphNodes.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium">
            Find people connected to a topic
          </h4>
          <p className="text-xs text-muted-foreground">
            Uses accepted, source-backed person and relationship claims.
            Connections suggest relevance; they do not verify a person&apos;s
            expertise.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              Topic or alias
              <Input
                value={expertQuery}
                onChange={(event) => setExpertQuery(event.target.value)}
                maxLength={160}
                placeholder="e.g. retrieval systems"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!expertQuery.trim() || expertsLoading}
              onClick={() => void findPeopleConnectedToTopic()}
            >
              {expertsLoading ? "Searching…" : "Find connected people"}
            </Button>
          </div>
          {experts &&
            (experts.length ? (
              <ul className="space-y-2">
                {experts.map((expert) => (
                  <li key={expert.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{expert.label}</p>
                    <ul className="mt-2 space-y-2">
                      {expert.connections.map((fact) => (
                        <li key={fact.id}>
                          <p>
                            {fact.subject} {fact.predicate} {fact.object}
                          </p>
                          <blockquote className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">
                            {fact.evidence}
                          </blockquote>
                          <Link
                            href={`/knowledge/${fact.collectionId}`}
                            className="mt-1 inline-block text-xs underline"
                          >
                            {fact.filename || fact.sourceUrl || "Open source"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No people with accepted links to that topic were found.
              </p>
            ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <h4 className="text-sm font-medium">Cross-source conflict scan</h4>
          <p className="text-xs text-muted-foreground">
            Classifies up to 40 new accepted claim pairs per scan. AI results
            are advisory; claims are never changed without your review.
          </p>
        </div>
        {canReview && (
          <Button
            size="sm"
            variant="outline"
            disabled={isScanningConflicts}
            onClick={() => void scanProjectConflicts()}
          >
            {isScanningConflicts ? "Scanning…" : "Scan project conflicts"}
          </Button>
        )}
      </div>
      {(graphData?.reviewedContradictions?.length ?? 0) > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium">Conflicting claims to review</h4>
          <p className="text-xs text-muted-foreground">
            These cross-source claim pairs were classified as contradictions.
            Review the evidence before resolving them.
          </p>
          {graphData?.reviewedContradictions?.map(
            ({ id, first, second, explanation }) => (
              <div
                key={id}
                className="rounded-md border border-destructive/40 p-3 text-sm"
              >
                <p>
                  <strong>{first.subject}</strong> {first.predicate}:{" "}
                  {first.object}{" "}
                  <span className="text-muted-foreground">vs.</span>{" "}
                  {second.object}
                </p>
                {explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {explanation}
                  </p>
                )}
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  <li>{first.evidence}</li>
                  <li>{second.evidence}</li>
                </ul>
                {canReview && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void resolveConflict(first.id, second.id, first.id)
                      }
                    >
                      Keep first
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void resolveConflict(first.id, second.id, second.id)
                      }
                    >
                      Keep second
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void resolveConflict(
                          first.id,
                          second.id,
                          undefined,
                          "dismiss",
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
      {(graphData?.contradictions.length ?? 0) > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium">
            Potentially conflicting claims
          </h4>
          <p className="text-xs text-muted-foreground">
            These claims share a subject and predicate but have different
            values. They may describe different times or contexts; review the
            source before resolving them.
          </p>
          {graphData?.contradictions.map(({ first, second }) => (
            <div
              key={`${first.id}:${second.id}`}
              className="rounded-md border border-amber-500/40 p-3 text-sm"
            >
              <p>
                <strong>{first.subject}</strong> {first.predicate}:{" "}
                {first.object}{" "}
                <span className="text-muted-foreground">vs.</span>{" "}
                {second.object}
              </p>
              {canReview && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void resolveConflict(first.id, second.id, first.id)
                    }
                  >
                    Keep first
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void resolveConflict(first.id, second.id, second.id)
                    }
                  >
                    Keep second
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void resolveConflict(
                        first.id,
                        second.id,
                        undefined,
                        "dismiss",
                      )
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {(conflictHistoryData?.history.length ?? 0) > 0 && (
        <details className="mt-5 rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Conflict classifications and review history (
            {conflictHistoryData?.history.length})
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            Model classifications and closed decisions remain linked to the
            source revisions that produced each claim. Only sources still
            attached to this project and accessible to you are shown.
          </p>
          <ul className="space-y-3">
            {conflictHistoryData?.history.map((decision) => (
              <li
                key={decision.id}
                className="rounded-md bg-muted/30 p-3 text-sm"
              >
                <p className="font-medium capitalize">
                  {decision.status} · {decision.verdict.replaceAll("_", " ")}
                  {decision.keptFactId
                    ? ` · kept ${decision.keptFactId === decision.first.id ? "first" : "second"}`
                    : ""}
                </p>
                <p className="mt-1">
                  <strong>{decision.first.subject}</strong>{" "}
                  {decision.first.predicate}: {decision.first.object}
                  <span className="text-muted-foreground"> vs. </span>
                  {decision.second.object}
                </p>
                {decision.explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {decision.explanation}
                  </p>
                )}
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {[decision.first, decision.second].map((fact, index) => (
                    <div
                      key={`${fact.id}:${fact.sourceVersionId}`}
                      className="rounded border p-2"
                    >
                      <p className="font-medium">
                        {index === 0 ? "First claim" : "Second claim"}
                        {fact.id === decision.keptFactId ? " · kept" : ""}
                      </p>
                      <p className="mt-1">
                        {fact.filename ?? "Source document"} · revision{" "}
                        {new Date(fact.sourceVersionCreatedAt).toLocaleString()}
                      </p>
                      <p className="mt-1">{fact.evidence}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-right text-[11px] text-muted-foreground">
                  Reviewed {new Date(decision.updatedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!data && isLoading && <Loader2 className="sr-only" />}
    </section>
  );
}
