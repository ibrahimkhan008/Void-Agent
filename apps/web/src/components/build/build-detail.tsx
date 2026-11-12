"use client";

import { useAppBuild } from "@/hooks/queries/use-app-builds";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";
import { Skeleton } from "ui/skeleton";

const activeStatuses = new Set(["queued", "generating", "provisioning"]);

export function BuildDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useAppBuild(id);
  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const build = data?.build;

  async function stopOrDelete() {
    setStopping(true);
    try {
      const response = await fetch(`/api/build/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? "Could not stop build");
      if (response.status === 202) {
        toast.success("Build cancellation requested");
        await mutate();
      } else {
        toast.success("Build deleted");
        router.push("/build");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not stop build",
      );
    } finally {
      setStopping(false);
    }
  }

  async function resume() {
    setResuming(true);
    try {
      const response = await fetch(
        `/api/build/${encodeURIComponent(id)}/resume`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? "Could not resume build");
      toast.success("Preview is starting");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resume build",
      );
    } finally {
      setResuming(false);
    }
  }

  if (isLoading)
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[420px] w-full" />
      </main>
    );
  if (!build)
    return (
      <main className="mx-auto max-w-3xl p-8 text-center">
        <p>Build not found.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/build">Back to builds</Link>
        </Button>
      </main>
    );

  const active = activeStatuses.has(build.status);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <Link
        href="/build"
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        App builder
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Eyebrow>Build</Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-normal tracking-[-0.03em] text-balance">
              {build.title || "App build"}
            </h1>
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
          </div>
          {build.summary && (
            <p className="text-sm text-muted-foreground">{build.summary}</p>
          )}
          <p className="text-xs text-muted-foreground">{build.prompt}</p>
        </div>
        <div className="flex items-center gap-2">
          {build.previewUrl && (
            <Button asChild variant="outline" size="sm">
              <a
                href={build.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 size-4" />
                Open preview
              </a>
            </Button>
          )}
          {!active &&
            build.status !== "cancelled" &&
            build.files.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={resume}
                disabled={resuming}
              >
                <RefreshCw
                  className={`mr-2 size-4 ${resuming ? "animate-spin" : ""}`}
                />
                Resume
              </Button>
            )}
          <Button
            variant={active ? "outline" : "ghost"}
            size="sm"
            onClick={stopOrDelete}
            disabled={stopping}
          >
            {stopping ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            {active ? "Cancel build" : "Delete"}
          </Button>
        </div>
      </header>

      {active && (
        <Card>
          <CardContent role="status" className="flex items-center gap-3 p-5">
            <Loader2 className="size-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">
                {build.status === "queued"
                  ? "Waiting to start"
                  : build.status === "generating"
                    ? "Designing the app"
                    : "Starting the secure preview"}
              </p>
              <p className="text-sm text-muted-foreground">
                This page checks build state automatically. You can cancel while
                it runs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {build.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {build.error}
        </div>
      )}

      {build.previewUrl && build.status === "ready" && (
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">Live preview</p>
          <iframe
            src={build.previewUrl}
            title="Generated app preview"
            className="h-[min(70vh,760px)] w-full rounded-lg border bg-white"
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
          />
        </section>
      )}

      {build.files.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Generated source files ({build.files.length})
          </summary>
          <div className="mt-4 space-y-3">
            {build.files.map((file) => (
              <section
                key={file.path}
                className="overflow-hidden rounded-md border"
              >
                <h2 className="border-b bg-muted/30 px-3 py-2 font-mono text-xs">
                  {file.path}
                </h2>
                <pre className="max-h-[360px] overflow-auto p-3 text-xs">
                  <code>{file.content}</code>
                </pre>
              </section>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
