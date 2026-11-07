"use client";

import {
  AudioLines,
  BrainCircuit,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import React from "react";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";

type VoiceInboxItem = {
  id: string;
  threadId: string;
  title: string;
  text: string;
  source: "voice_device" | "voice_realtime";
  createdAt: string;
};

type VoiceIntentPreview = {
  intent:
    | "question"
    | "task"
    | "note"
    | "workflow"
    | "agent"
    | "scheduled_agent"
    | "unknown";
  title: string;
  summary: string;
};

function parseVoiceIntentPreview(value: unknown): VoiceIntentPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const intents = [
    "question",
    "task",
    "note",
    "workflow",
    "agent",
    "scheduled_agent",
    "unknown",
  ];
  if (
    typeof candidate.intent !== "string" ||
    !intents.includes(candidate.intent) ||
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string"
  )
    return null;
  return {
    intent: candidate.intent as VoiceIntentPreview["intent"],
    title: candidate.title,
    summary: candidate.summary,
  };
}

export function VoiceInbox() {
  const [items, setItems] = useState<VoiceInboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, VoiceIntentPreview>>(
    {},
  );
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>(
    {},
  );
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const previewIntent = useCallback(async (messageId: string) => {
    setPreviewingId(messageId);
    setPreviewErrors((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    try {
      const response = await fetch("/api/voice/transcript/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        preview?: unknown;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error ?? "Could not preview this transcript.");
      const preview = parseVoiceIntentPreview(payload?.preview);
      if (!preview) throw new Error("The preview response was invalid.");
      setPreviews((current) => ({ ...current, [messageId]: preview }));
    } catch (cause) {
      setPreviewErrors((current) => ({
        ...current,
        [messageId]:
          cause instanceof Error
            ? cause.message
            : "Could not preview this transcript.",
      }));
    } finally {
      setPreviewingId((current) => (current === messageId ? null : current));
    }
  }, []);

  const load = useCallback(async (nextCursor?: string | null) => {
    if (nextCursor) setLoadingMore(true);
    else setBusy(true);
    setError(null);
    try {
      const query = nextCursor
        ? `?cursor=${encodeURIComponent(nextCursor)}`
        : "";
      const response = await fetch(`/api/voice/inbox${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: VoiceInboxItem[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.error ?? "Could not load saved voice transcripts.",
        );
      setItems((current) =>
        nextCursor
          ? [...current, ...(payload.items ?? [])]
          : (payload.items ?? []),
      );
      setCursor(payload.nextCursor ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load saved voice transcripts.",
      );
    } finally {
      setBusy(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Voice</p>
          <h1 className="mt-1 text-3xl font-semibold">Voice inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved transcripts from voice conversations and paired devices. Open
            a transcript in its chat to review it; nothing is run automatically.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={busy || loadingMore}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy ? (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Loading saved transcripts…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AudioLines className="size-8 text-muted-foreground" />
            <h2 className="font-medium">No saved voice transcripts yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Completed browser voice conversations and reviewed device
              transcripts will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section
          aria-label="Saved voice transcripts"
          className="flex flex-col gap-3"
        >
          {items.map((item) => {
            const href =
              item.source === "voice_device"
                ? `/chat/${encodeURIComponent(item.threadId)}?processVoice=${encodeURIComponent(item.id)}`
                : `/chat/${encodeURIComponent(item.threadId)}`;
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AudioLines className="size-4 shrink-0 text-muted-foreground" />
                      <h2 className="truncate font-medium">
                        {item.title || "Voice transcript"}
                      </h2>
                    </div>
                    <time
                      className="mt-1 block text-xs text-muted-foreground"
                      dateTime={item.createdAt}
                    >
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                      {item.text || "No text transcript was saved."}
                    </p>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {item.source === "voice_device"
                        ? "Voice device"
                        : "Browser voice"}
                    </span>
                    {previews[item.id] ? (
                      <div
                        className="mt-3 rounded-md border bg-muted/40 p-3 text-sm"
                        aria-label="Voice intent preview"
                      >
                        <p className="font-medium">
                          {previews[item.id].title} · {previews[item.id].intent}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {previews[item.id].summary}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Preview only. No task or tool was run.
                        </p>
                      </div>
                    ) : null}
                    {previewErrors[item.id] ? (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {previewErrors[item.id]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void previewIntent(item.id)}
                      disabled={previewingId !== null}
                      aria-label={`${previewErrors[item.id] ? "Retry" : previews[item.id] ? "Refresh" : "Preview"} intent for ${item.title || "voice transcript"}`}
                    >
                      {previewingId === item.id ? (
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                      ) : (
                        <BrainCircuit className="mr-2 size-4" />
                      )}
                      {previewingId === item.id
                        ? "Previewing"
                        : previewErrors[item.id]
                          ? "Retry preview"
                          : previews[item.id]
                            ? "Refresh preview"
                            : "Preview intent"}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>
                        <MessageSquareText className="mr-2 size-4" />
                        Review in chat
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
      {cursor && (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => void load(cursor)}
          disabled={loadingMore}
        >
          {loadingMore && <LoaderCircle className="mr-2 size-4 animate-spin" />}
          Load older transcripts
        </Button>
      )}
    </main>
  );
}
