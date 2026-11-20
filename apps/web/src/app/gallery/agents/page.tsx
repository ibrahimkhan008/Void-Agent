import "server-only";

import { GalleryForkButton } from "@/components/agent/gallery-fork-button";
import { getSession } from "auth/server";
import type { AgentEntity } from "lib/db/pg/schema.pg";
import { agentInstallRepository, agentRepository } from "lib/db/repository";
import { GitFork } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Card, CardContent, CardFooter } from "ui/card";
import { Input } from "ui/input";

// ---------------------------------------------------------------------------
// /gallery/agents — the public agent gallery
// ---------------------------------------------------------------------------
// Platform-wide listing of agents their owners published (publishedAt set).
// Anyone can browse (middleware treats the path as a public destination); forking
// requires sign-in and copies the agent into the forker's account.
// Backed by the P4.0 publication repository (listPublishedAgents /
// searchPublishedAgents) — the org-scoped visibility system is untouched:
// publishing is an explicit owner action on top of Public/Readonly
// visibility.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Gallery — Void Agent",
  description:
    "Browse community agents published by Void Agent users. Fork any agent into your account and customize it.",
};

export default async function AgentGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [session, agents] = await Promise.all([
    getSession(),
    query
      ? agentInstallRepository.searchPublishedAgents(query, 50)
      : agentInstallRepository.listPublishedAgents(50, 0),
  ]);
  const isSignedIn = Boolean(session?.user?.id);

  // The browse queries are owner-free by design; attribute authors afterwards.
  const authorNames = await agentRepository.getAgentAuthorNames([
    ...new Set(agents.map((agent) => agent.userId)),
  ]);

  return (
    <main className="min-h-screen w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Agent Gallery
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            Community agents published by Void Agent users. Fork one into your
            account to get a fully editable copy — the original stays untouched,
            just like forking a repository.
          </p>
          <form
            action="/gallery/agents"
            className="flex max-w-md gap-2"
            role="search"
          >
            <Input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search published agents…"
              aria-label="Search published agents"
            />
          </form>
        </header>

        <section aria-label="Published agents">
          {agents.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">
              {query
                ? `No published agents match “${query}”.`
                : "No published agents yet. Publish one of your Public agents from its edit page to see it here."}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <GalleryAgentCard
                  key={agent.id}
                  agent={agent}
                  authorName={authorNames.get(agent.userId) ?? undefined}
                  isSignedIn={isSignedIn}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function GalleryAgentCard({
  agent,
  authorName,
  isSignedIn,
}: {
  agent: AgentEntity;
  authorName?: string;
  isSignedIn: boolean;
}) {
  const forkCount = agent.forkCount ?? 0;
  return (
    <Card
      className="min-h-[196px] flex flex-col gap-3"
      data-testid="gallery-agent-card"
    >
      <div className="flex gap-3 items-stretch min-w-0 p-6 pb-0">
        <div
          style={{ backgroundColor: agent.icon?.style?.backgroundColor }}
          className="p-2 rounded-lg flex items-center justify-center ring ring-background border shrink-0"
        >
          <Avatar className="size-6">
            <AvatarImage src={agent.icon?.value} />
            <AvatarFallback>{agent.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
        <div className="flex flex-col justify-around min-w-0 flex-1 overflow-hidden">
          <Link
            href={`/gallery/agents/${agent.id}`}
            className="truncate font-medium hover:underline"
          >
            {agent.name}
          </Link>
          <div className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
            {authorName && <span className="truncate">{authorName}</span>}
            {forkCount > 0 && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <GitFork className="size-3" />
                {forkCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <CardContent className="min-h-0 grow px-6">
        <p className="text-xs text-muted-foreground line-clamp-3 break-words">
          {agent.description ?? "No description."}
        </p>
      </CardContent>

      <CardFooter className="px-6 pb-6 pt-0">
        <GalleryForkButton
          agentId={agent.id}
          agentName={agent.name}
          isSignedIn={isSignedIn}
        />
      </CardFooter>
    </Card>
  );
}
