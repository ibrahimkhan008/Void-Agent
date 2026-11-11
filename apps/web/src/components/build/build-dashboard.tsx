"use client";

import { useAppBuilds } from "@/hooks/queries/use-app-builds";
import { fetcher } from "lib/utils";
import { Loader2, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";

type Thread = { id: string; title: string; createdAt?: string };

type BuildMode = "static" | "agent";

const MODE_OPTIONS: {
  value: BuildMode;
  label: string;
  description: string;
}[] = [
  {
    value: "static",
    label: "Fast",
    description: "One generation pass. Ready in seconds.",
  },
  {
    value: "agent",
    label: "Multi-step",
    description:
      "Generate, self-review, and refine before hosting. Slower, better for complex apps.",
  },
];

export function BuildDashboard({
  initialThreadId,
}: { initialThreadId?: string }) {
  const router = useRouter();
  const { data: buildData, isLoading, mutate } = useAppBuilds();
  const { data: threads } = useSWR<Thread[]>("/api/thread", fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
  });
  const [threadId, setThreadId] = useState(initialThreadId ?? "");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<BuildMode>("static");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);

  const selectedThread = useMemo(
    () => threads?.find((thread) => thread.id === threadId),
    [threads, threadId],
  );
  useEffect(() => {
    if (
      initialThreadId &&
      threads?.some((thread) => thread.id === initialThreadId)
    ) {
      setThreadId(initialThreadId);
    } else if (!threadId && threads?.[0]) {
      setThreadId(threads[0].id);
    }
  }, [initialThreadId, threadId, threads]);

  async function createBuild() {
    if (!selectedThread) {
      toast.error("Choose a conversation to attach this build to.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          threadId,
          mode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      setPrompt("");
      setQuestions([]);
      await mutate();
      router.push(`/build/${payload.buildId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the build",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Ask whether the prompt is specific enough before spending a sandbox on a
   * guess. The clarify pass is an optimisation, never a gate — on any failure
   * it falls straight through to the build.
   */
  async function checkThenCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) {
      toast.error("Choose a conversation to attach this build to.");
      return;
    }
    setChecking(true);
    try {
      const response = await fetch("/api/build/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (
        response.ok &&
        payload.readyToBuild === false &&
        Array.isArray(payload.questions) &&
        payload.questions.length
      ) {
        setQuestions(payload.questions.slice(0, 4));
        return;
      }
    } catch {
      // Clarification is an optimisation, never a gate — fall through.
    } finally {
      setChecking(false);
    }
    await createBuild();
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex items-start gap-3">
        <Rocket className="mt-1 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">App builder</h1>
          <p className="text-sm text-muted-foreground">
            Generate a small web app and preview it in an owner-scoped E2B
            sandbox.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-5">
          <form className="space-y-4" onSubmit={checkThenCreate}>
            <div className="space-y-2">
              <Label htmlFor="build-prompt">What should the app do?</Label>
              <Textarea
                id="build-prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value.slice(0, 4000));
                  if (questions.length) setQuestions([]);
                }}
                maxLength={4000}
                rows={5}
                placeholder="Describe the app, its main interactions, and what users should see."
                required
                data-testid="app-build-prompt"
              />
              <p className="text-right text-xs text-muted-foreground">
                {prompt.length}/4000
              </p>
            </div>
            <div className="space-y-2">
              <Label>Build mode</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    aria-pressed={mode === option.value}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      mode === option.value
                        ? "border-primary bg-accent/50"
                        : "hover:bg-accent/30"
                    }`}
                    data-testid={`app-build-mode-${option.value}`}
                  >
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attach to conversation</Label>
              {threads?.length ? (
                <Select value={threadId} onValueChange={setThreadId}>
                  <SelectTrigger aria-label="Attach to conversation">
                    <SelectValue placeholder="Select a conversation" />
                  </SelectTrigger>
                  <SelectContent>
                    {threads.map((thread) => (
                      <SelectItem key={thread.id} value={thread.id}>
                        {thread.title || "Untitled conversation"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Create a conversation first to start a build.
                </p>
              )}
            </div>
            {questions.length > 0 && (
              <div
                role="status"
                className="space-y-2 rounded-lg border border-border bg-accent/20 p-3"
              >
                <p className="text-sm font-medium">
                  A few things would change what gets built:
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  {questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  Add the answers to your description above, or build anyway and
                  sensible defaults will be chosen.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={
                  submitting || checking || !prompt.trim() || !selectedThread
                }
              >
                {submitting || checking ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                {submitting
                  ? "Starting build…"
                  : checking
                    ? "Checking…"
                    : "Build app"}
              </Button>
              {questions.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={createBuild}
                  disabled={submitting || !selectedThread}
                >
                  Build anyway
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-medium">Your builds</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : buildData?.builds.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {buildData.builds.map((build) => (
              <Link key={build.id} href={`/build/${build.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {build.title || "Building app"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {build.summary || build.status}
                      </p>
                    </div>
                    <Badge
                      variant={
                        build.status === "failed"
                          ? "destructive"
                          : build.status === "ready"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {build.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No apps built yet.
          </p>
        )}
      </section>
    </main>
  );
}
