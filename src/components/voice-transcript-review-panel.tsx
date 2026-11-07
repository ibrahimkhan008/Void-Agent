"use client";

import { buildVoiceDraftHandoff } from "lib/voice/draft-handoff";
import { isCurrentVoiceRequest } from "lib/voice/handoff";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "ui/button";

type Preview = {
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

export function VoiceTranscriptReviewPanel({
  messageId,
  transcript,
  sending,
  onCancel,
  onSend,
}: {
  messageId: string;
  transcript: string;
  sending: boolean;
  onCancel: () => void;
  onSend: (text: string) => void;
}) {
  const [previewState, setPreviewState] = useState<{
    messageId: string;
    preview: Preview;
  } | null>(null);
  const [previewingMessageId, setPreviewingMessageId] = useState<string | null>(
    null,
  );
  const [previewErrorState, setPreviewErrorState] = useState<{
    messageId: string;
    error: string;
  } | null>(null);
  const previewGenerationRef = useRef(0);
  const currentMessageIdRef = useRef(messageId);
  if (currentMessageIdRef.current !== messageId) {
    currentMessageIdRef.current = messageId;
    previewGenerationRef.current += 1;
  }
  const preview =
    previewState?.messageId === messageId ? previewState.preview : null;
  const previewing = previewingMessageId === messageId;
  const previewError =
    previewErrorState?.messageId === messageId ? previewErrorState.error : null;

  useEffect(() => {
    setPreviewState(null);
    setPreviewingMessageId(null);
    setPreviewErrorState(null);
  }, [messageId]);

  const previewIntent = async () => {
    const requestedMessageId = messageId;
    const requestedGeneration = ++previewGenerationRef.current;
    const isCurrentRequest = () =>
      isCurrentVoiceRequest({
        requestedIdentity: requestedMessageId,
        currentIdentity: currentMessageIdRef.current,
        requestedGeneration,
        currentGeneration: previewGenerationRef.current,
      });

    setPreviewingMessageId(requestedMessageId);
    setPreviewErrorState(null);
    try {
      const response = await fetch("/api/voice/transcript/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: requestedMessageId }),
      });
      const result = (await response.json().catch(() => null)) as {
        preview?: Preview;
        error?: string;
      } | null;
      if (!response.ok || !result?.preview) {
        throw new Error(result?.error || "Could not classify this transcript.");
      }
      if (!isCurrentRequest()) return;
      setPreviewState({
        messageId: requestedMessageId,
        preview: result.preview,
      });
    } catch (error) {
      if (isCurrentRequest()) {
        setPreviewErrorState({
          messageId: requestedMessageId,
          error:
            error instanceof Error
              ? error.message
              : "Could not classify this transcript.",
        });
      }
    } finally {
      if (isCurrentRequest()) setPreviewingMessageId(null);
    }
  };

  return (
    <section
      aria-label="Review saved voice request"
      className="mx-auto mb-2 max-w-3xl rounded-lg border bg-card p-4 shadow-sm"
    >
      <h2 className="font-medium">Review saved voice request</h2>
      <p className="my-2 text-sm text-muted-foreground">
        Preview the intent or send this transcript as a new chat request. Any
        external action still uses Void-Agent&apos;s normal review and approval
        flow.
      </p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
        {transcript}
      </pre>
      {preview && (
        <div
          className="mt-3 rounded-md border bg-background p-3"
          aria-live="polite"
        >
          <div className="text-sm font-medium">
            Intent preview: {preview.intent.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-sm">{preview.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.summary}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Preview only. No action was run.
          </p>
        </div>
      )}
      {preview &&
        (preview.intent === "agent" ||
          preview.intent === "scheduled_agent") && (
          <div className="mt-3 rounded-md border p-3">
            <p className="text-sm font-medium">Prepare an agent proposal</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The assistant will prepare its normal editable CreateAgent review
              card. Saving an agent or schedule still requires your approval.
            </p>
            <Button
              type="button"
              className="mt-2"
              size="sm"
              disabled={sending}
              onClick={() =>
                onSend(buildVoiceDraftHandoff(transcript, preview.intent))
              }
            >
              Prepare editable agent proposal
            </Button>
          </div>
        )}
      {preview?.intent === "workflow" && (
        <div className="mt-3 rounded-md border p-3">
          <p className="text-sm font-medium">Prepare a workflow plan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This creates a planning response in chat only. Build in the Workflow
            editor; running a workflow still needs its normal approval card.
          </p>
          <Button
            type="button"
            className="mt-2"
            size="sm"
            disabled={sending}
            onClick={() =>
              onSend(buildVoiceDraftHandoff(transcript, preview.intent))
            }
          >
            Plan workflow in chat
          </Button>
        </div>
      )}
      {previewError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {previewError}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={previewing}
          onClick={() => void previewIntent()}
        >
          {previewing
            ? "Previewing…"
            : preview
              ? "Refresh intent preview"
              : "Preview intent"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={sending}
          onClick={() => onSend(transcript)}
        >
          Send to assistant
        </Button>
      </div>
    </section>
  );
}
