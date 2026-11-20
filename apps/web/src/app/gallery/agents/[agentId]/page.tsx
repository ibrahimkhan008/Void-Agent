import "server-only";

import { GalleryForkButton } from "@/components/agent/gallery-fork-button";
import { getSession } from "auth/server";
import { agentInstallRepository, agentRepository } from "lib/db/repository";
import { GitFork } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";

// ---------------------------------------------------------------------------
// /gallery/agents/[agentId] — public detail view of a published agent.
// getPublishedAgent returns the row only while it stays published AND
// Public/Readonly; anything else is a single indistinguishable 404 so an
// unpublish is also an unlist.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ agentId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { agentId } = await params;
  const agent = await agentInstallRepository.getPublishedAgent(agentId);
  if (!agent) return { title: "Agent not found — Void Agent" };
  return {
    title: `${agent.name} — Agent Gallery — Void Agent`,
    description: agent.description ?? undefined,
  };
}

export default async function AgentGalleryDetailPage({ params }: PageProps) {
  const { agentId } = await params;
  const [session, agent] = await Promise.all([
    getSession(),
    agentInstallRepository.getPublishedAgent(agentId),
  ]);
  if (!agent) {
    notFound();
  }
  const isSignedIn = Boolean(session?.user?.id);
  const [authorName] = await agentRepository
    .getAgentAuthorNames([agent.userId])
    .then((names) => [names.get(agent.userId) ?? undefined]);

  const systemPrompt = agent.instructions?.systemPrompt?.trim();
  const forkCount = agent.forkCount ?? 0;

  return (
    <main className="min-h-screen w-full">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-6">
        <Link
          href="/gallery/agents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Agent Gallery
        </Link>

        <header className="flex gap-4 items-start">
          <div
            style={{ backgroundColor: agent.icon?.style?.backgroundColor }}
            className="p-3 rounded-xl flex items-center justify-center ring ring-background border shrink-0"
          >
            <Avatar className="size-8">
              <AvatarImage src={agent.icon?.value} />
              <AvatarFallback>{agent.name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight break-words">
              {agent.name}
            </h1>
            <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              {authorName && <span>by {authorName}</span>}
              {agent.publishedAt && (
                <span>
                  published{" "}
                  {agent.publishedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <GitFork className="size-3.5" />
                {forkCount} {forkCount === 1 ? "fork" : "forks"}
              </span>
            </p>
          </div>
        </header>

        <section aria-label="Agent description" className="text-sm">
          {agent.description ?? "No description."}
        </section>

        {systemPrompt && (
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              System prompt
            </summary>
            <pre className="px-4 pb-4 pt-0 text-xs whitespace-pre-wrap break-words text-muted-foreground">
              {systemPrompt}
            </pre>
          </details>
        )}

        <div className="flex items-center gap-3 pt-2">
          <GalleryForkButton
            agentId={agent.id}
            agentName={agent.name}
            isSignedIn={isSignedIn}
          />
          <p className="text-xs text-muted-foreground">
            Forking copies the agent&apos;s instructions, tools, knowledge
            bases, and pinned model into your account. The original stays
            untouched.
          </p>
        </div>
      </div>
    </main>
  );
}
