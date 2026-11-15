"use client";

import { AgentsList } from "@/components/agent/agents-list";
import {
  SavedNotesContent,
  UserInstructionsContent,
} from "@/components/chat-preferences-content";
import { ConnectorSettings } from "@/components/connectors/connector-settings";
import type { MarketplaceMcpServer } from "@/components/mcp-marketplace";
import { MemoryManager } from "@/components/memory/memory-manager";
import { SkillsSearchDialog } from "@/components/skills/skills-search-dialog";
import { useSkills } from "@/hooks/queries/use-skills";
import type { AgentSummary } from "app-types/agent";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";

type Tab =
  | "skills"
  | "connectors"
  | "agents"
  | "instructions"
  | "memory"
  | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "agents", label: "Agents" },
  { id: "instructions", label: "Instructions" },
  { id: "memory", label: "Memory" },
  { id: "notes", label: "Notes" },
];

type Toolkit = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

function SkillsPanel({ userId }: { userId: string }) {
  const { skills, isLoading, mutate } = useSkills();
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
    setContent("");
  };

  const createSkill = async () => {
    const cleanName = name.trim();
    const cleanContent = content.trim();
    if (!cleanName || !cleanContent) return;
    setSaving(true);
    try {
      const slug = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 180);
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          description: description.trim() || undefined,
          slug: slug || `skill-${Date.now()}`,
          source: "voidagent/custom",
          content: cleanContent,
          visibility: "private",
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error ?? result?.message ?? "Could not save skill.",
        );
      }
      await mutate();
      setCreateOpen(false);
      resetForm();
      toast.success("Skill saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save skill.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (id: string) => {
    setDeleting(id);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete skill.");
      await mutate();
      toast.success("Skill deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete skill.",
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable instructions you can call in chat with{" "}
            <code>/skill-name</code>.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBrowseOpen(true)}
          >
            Browse skills
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" /> New skill
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div
          role="status"
          className="rounded-2xl border p-10 text-center text-sm text-muted-foreground"
        >
          Loading skills…
        </div>
      ) : skills.length === 0 ? (
        <div className="relative flex min-h-[230px] flex-col items-center justify-center overflow-hidden rounded-2xl border bg-card px-6 py-10 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-[radial-gradient(rgba(255,255,255,.12)_0.7px,transparent_0.7px)] [background-size:8px_8px] [mask-image:linear-gradient(to_top,black,transparent)]"
          />
          <h2 className="relative font-semibold">No skills yet</h2>
          <p className="relative mt-2 text-sm text-muted-foreground">
            Write one yourself or import a reusable skill.
          </p>
          <Button
            className="relative mt-5 rounded-full"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-4" /> Create a skill
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((skill) => (
            <article
              key={skill.id}
              className="flex min-w-0 items-start gap-3 rounded-2xl border bg-card p-4"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium">{skill.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {skill.description || skill.source}
                </p>
              </div>
              {skill.userId === userId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${skill.name}`}
                  disabled={deleting === skill.id}
                  onClick={() => void deleteSkill(skill.id)}
                >
                  {deleting === skill.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New skill</DialogTitle>
            <DialogDescription>
              Write reusable instructions for a task you do often.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="presentation"
                maxLength={200}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this skill helps with"
                maxLength={2000}
              />
            </label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">
              Instructions
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  "## Goal\n\n## When to use\n\n## Instructions\n\n## Constraints\n\n## Output format"
                }
                className="min-h-56 resize-y font-mono text-sm"
                maxLength={50000}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || !name.trim() || !content.trim()}
              onClick={() => void createSkill()}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{" "}
              Save skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SkillsSearchDialog open={browseOpen} onOpenChange={setBrowseOpen} />
    </section>
  );
}

function MarketplaceView({
  servers,
}: {
  servers: MarketplaceMcpServer[];
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ paginate: "true", limit: "50" });
    if (debouncedQuery.length >= 3) params.set("search", debouncedQuery);
    fetch(`/api/connections?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(body?.error ?? "Could not load marketplace.");
        if (!active) return;
        setToolkits(body?.toolkits ?? []);
        setNextCursor(body?.nextCursor ?? null);
        setConfigured(body?.configured !== false);
      })
      .catch((loadError) => {
        if (!active) return;
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load marketplace.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedQuery]);

  const filtered = useMemo(() => {
    const normalized = debouncedQuery.toLowerCase();
    return toolkits.filter((toolkit) =>
      `${toolkit.name} ${toolkit.slug}`.toLowerCase().includes(normalized),
    );
  }, [debouncedQuery, toolkits]);

  const featured = useMemo(() => {
    const priority = ["github", "notion", "linear", "jira", "google-drive"];
    return [...filtered]
      .sort((a, b) => {
        const ai = priority.indexOf(a.slug.toLowerCase());
        const bi = priority.indexOf(b.slug.toLowerCase());
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      })
      .slice(0, 4);
  }, [filtered]);
  const featuredSlugs = new Set(featured.map((toolkit) => toolkit.slug));
  const browse = filtered.filter((toolkit) => !featuredSlugs.has(toolkit.slug));

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        paginate: "true",
        limit: "50",
        nextCursor,
      });
      if (debouncedQuery.length >= 3) params.set("search", debouncedQuery);
      const response = await fetch(`/api/connections?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error ?? "Could not load more apps.");
      setToolkits((current) => [...current, ...(body?.toolkits ?? [])]);
      setNextCursor(body?.nextCursor ?? null);
    } catch (loadError) {
      toast.error(
        loadError instanceof Error
          ? loadError.message
          : "Could not load more apps.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const connect = async (toolkit: Toolkit) => {
    if (toolkit.isConnected && toolkit.connectedAccountId) {
      setConnecting(toolkit.slug);
      try {
        const response = await fetch("/api/connections/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectedAccountId: toolkit.connectedAccountId,
          }),
        });
        if (!response.ok) throw new Error("Could not disconnect app.");
        setToolkits((current) =>
          current.map((item) =>
            item.slug === toolkit.slug
              ? { ...item, isConnected: false, connectedAccountId: undefined }
              : item,
          ),
        );
        toast.success(`${toolkit.name} disconnected.`);
      } catch (disconnectError) {
        toast.error(
          disconnectError instanceof Error
            ? disconnectError.message
            : "Could not disconnect app.",
        );
      } finally {
        setConnecting(null);
      }
      return;
    }

    setConnecting(toolkit.slug);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolkit: toolkit.slug,
          callbackUrl: `${window.location.origin}/customize?tab=connectors&view=marketplace`,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.redirectUrl !== "string") {
        throw new Error(body?.error ?? "Could not start app authorization.");
      }
      window.location.assign(body.redirectUrl);
    } catch (connectError) {
      toast.error(
        connectError instanceof Error
          ? connectError.message
          : "Could not start app authorization.",
      );
      setConnecting(null);
    }
  };

  const renderToolkit = (toolkit: Toolkit) => (
    <article
      key={toolkit.slug}
      className="flex min-h-[66px] items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5"
    >
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background">
        {toolkit.logo ? (
          <img src={toolkit.logo} alt="" className="size-6 object-contain" />
        ) : (
          <SlidersHorizontal className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{toolkit.name}</h3>
        <p className="truncate text-xs text-muted-foreground">
          {toolkit.description ||
            `Connect ${toolkit.name} to use its tools in chat.`}
        </p>
      </div>
      <Button
        size="sm"
        variant={toolkit.isConnected ? "outline" : "secondary"}
        disabled={connecting === toolkit.slug}
        onClick={() => void connect(toolkit)}
      >
        {connecting === toolkit.slug ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : toolkit.isConnected ? (
          <Check className="mr-1 size-3.5" />
        ) : null}
        {toolkit.isConnected ? "Connected" : "Connect"}
      </Button>
    </article>
  );

  return (
    <section className="space-y-6">
      <Link
        href="/customize?tab=connectors"
        className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm hover:bg-secondary/80"
      >
        <ArrowLeft className="size-4" /> Back to connectors
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Marketplace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect apps to bring their tools into your chats and agents.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Authorization is handled by the selected app provider. Connections are
          scoped to your account.
        </p>
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search connectors"
          aria-label="Search connectors"
          className="h-10 rounded-full pl-10"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {configured === false ? (
        <div className="rounded-2xl border p-8 text-center">
          <h2 className="font-semibold">
            Marketplace connections are not configured
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the built-in Connectors tab for direct OAuth connections, or
            configure Composio to enable its larger app catalog.
          </p>
        </div>
      ) : null}
      {loading ? (
        <p
          role="status"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          Loading marketplace…
        </p>
      ) : null}
      {!loading && configured !== false && !error && filtered.length === 0 ? (
        <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
          No apps found. Try a different search.
        </p>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Featured</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {featured.map(renderToolkit)}
            </div>
          </div>
          {browse.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Browse</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {browse.map(renderToolkit)}
              </div>
            </div>
          ) : null}
          {nextCursor ? (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Load more apps
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {servers.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Curated MCP servers</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {servers.map((server) => (
              <article
                key={server.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-3"
              >
                <Store className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{server.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {server.description || "Curated MCP server"}
                  </p>
                </div>
                <Link
                  className="text-sm underline underline-offset-4"
                  href="/marketplace/mcp"
                >
                  Details
                </Link>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function CustomizePage({
  tab,
  view,
  userId,
  userRole,
  agents,
  marketplaceServers,
}: {
  tab: Tab;
  view?: "marketplace";
  userId: string;
  userRole?: string | null;
  agents: AgentSummary[];
  marketplaceServers: MarketplaceMcpServer[];
}) {
  const myAgents = agents.filter((agent) => agent.userId === userId);
  const sharedAgents = agents.filter((agent) => agent.userId !== userId);

  return (
    <main className="mx-auto min-h-full w-full max-w-[720px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12">
      <div className="mb-8 flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:relative sm:left-1/2 sm:w-max sm:max-w-none sm:-translate-x-1/2 sm:justify-center sm:overflow-visible sm:gap-2">
        <nav
          aria-label="Customize sections"
          className="flex shrink-0 flex-nowrap items-center gap-1"
        >
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={`/customize?tab=${item.id}`}
              aria-current={tab === item.id ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === item.id ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/customize?tab=connectors&view=marketplace"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Store className="size-4" /> Browse marketplace
        </Link>
      </div>

      {tab === "skills" ? <SkillsPanel userId={userId} /> : null}
      {tab === "connectors" && view === "marketplace" ? (
        <MarketplaceView servers={marketplaceServers} />
      ) : null}
      {tab === "connectors" && view !== "marketplace" ? (
        <ConnectorSettings embedded />
      ) : null}
      {tab === "agents" ? (
        <AgentsList
          initialMyAgents={myAgents}
          initialSharedAgents={sharedAgents}
          userId={userId}
          userRole={userRole}
        />
      ) : null}
      {tab === "instructions" ? <UserInstructionsContent /> : null}
      {tab === "memory" ? <MemoryManager /> : null}
      {tab === "notes" ? <SavedNotesContent /> : null}
    </main>
  );
}
