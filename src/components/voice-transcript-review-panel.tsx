"use client";

import { buildVoiceDraftHandoff } from "lib/voice/draft-handoff";
import { isCurrentVoiceRequest } from "lib/voice/handoff";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "ui/button";

type TaskDestination = { id: string; name: string };
type TaskDestinationOptions = { kind: string; items: TaskDestination[] };

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
  const [taskProvider, setTaskProvider] = useState<"asana" | "clickup">(
    "asana",
  );
  const [parentOptions, setParentOptions] =
    useState<TaskDestinationOptions | null>(null);
  const [targetOptions, setTargetOptions] =
    useState<TaskDestinationOptions | null>(null);
  const [parentId, setParentId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskDetails, setTaskDetails] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
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

  useEffect(() => {
    if (preview?.intent !== "task") {
      setParentOptions(null);
      setTargetOptions(null);
      return;
    }
    let active = true;
    setTaskLoading(true);
    setTaskError(null);
    setParentId("");
    setTargetId("");
    setTargetOptions(null);
    void fetch("/api/voice/transcript/task-command", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "options",
        messageId,
        provider: taskProvider,
      }),
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | (TaskDestinationOptions & { error?: string })
          | null;
        if (!response.ok || !result || !Array.isArray(result.items))
          throw new Error(result?.error ?? "Could not load task destinations.");
        if (active) setParentOptions(result);
      })
      .catch((error) => {
        if (active)
          setTaskError(
            error instanceof Error
              ? error.message
              : "Could not load task destinations.",
          );
      })
      .finally(() => {
        if (active) setTaskLoading(false);
      });
    return () => {
      active = false;
    };
  }, [messageId, preview?.intent, taskProvider]);

  useEffect(() => {
    if (!parentId || preview?.intent !== "task") {
      setTargetOptions(null);
      return;
    }
    let active = true;
    setTaskLoading(true);
    setTaskError(null);
    setTargetId("");
    void fetch("/api/voice/transcript/task-command", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "options",
        messageId,
        provider: taskProvider,
        parentId,
      }),
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | (TaskDestinationOptions & { error?: string })
          | null;
        if (!response.ok || !result || !Array.isArray(result.items))
          throw new Error(result?.error ?? "Could not load task destinations.");
        if (active) setTargetOptions(result);
      })
      .catch((error) => {
        if (active)
          setTaskError(
            error instanceof Error
              ? error.message
              : "Could not load task destinations.",
          );
      })
      .finally(() => {
        if (active) setTaskLoading(false);
      });
    return () => {
      active = false;
    };
  }, [messageId, parentId, preview?.intent, taskProvider]);

  useEffect(() => {
    if (preview?.intent === "task") {
      setTaskName(preview.title);
      setTaskDetails(transcript);
      setTaskMessage(null);
    }
  }, [messageId, preview?.intent, preview?.title, transcript]);

  const createReviewedTask = async () => {
    const target = targetOptions?.items.find((item) => item.id === targetId);
    if (!target || !taskName.trim()) return;
    setTaskBusy(true);
    setTaskError(null);
    setTaskMessage(null);
    const payload = {
      provider: taskProvider,
      targetId,
      name: taskName.trim(),
      details: taskDetails.trim(),
    };
    try {
      const approvalResponse = await fetch(
        "/api/voice/transcript/task-command",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            messageId,
            parentId,
            ...payload,
          }),
          cache: "no-store",
        },
      );
      const approval = (await approvalResponse.json().catch(() => null)) as {
        approvalToken?: string;
        error?: string;
      } | null;
      if (!approvalResponse.ok || !approval?.approvalToken)
        throw new Error(approval?.error ?? "Could not record your approval.");
      const response = await fetch("/api/voice/transcript/task-command", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          messageId,
          parentId,
          ...payload,
          approvalToken: approval.approvalToken,
        }),
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !result?.ok)
        throw new Error(result?.error ?? "Task creation failed.");
      setTaskMessage(`Created “${payload.name}” in ${target.name}.`);
    } catch (error) {
      setTaskError(
        error instanceof Error ? error.message : "Task creation failed.",
      );
    } finally {
      setTaskBusy(false);
    }
  };

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
      {preview?.intent === "task" && (
        <div className="mt-3 rounded-md border p-3">
          <p className="text-sm font-medium">Review task creation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a connected destination and review every field. Nothing is
            sent until you create the task.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Service
              <select
                aria-label="Task service"
                className="h-9 rounded-md border bg-background px-2"
                value={taskProvider}
                onChange={(event) => {
                  setTaskProvider(event.target.value as "asana" | "clickup");
                  setParentId("");
                  setTargetId("");
                  setParentOptions(null);
                  setTargetOptions(null);
                }}
              >
                <option value="asana">Asana</option>
                <option value="clickup">ClickUp</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {taskProvider === "asana" ? "Workspace" : "Space"}
              <select
                aria-label={taskProvider === "asana" ? "Workspace" : "Space"}
                className="h-9 rounded-md border bg-background px-2"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Choose…</option>
                {parentOptions?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {parentId && (
              <label className="grid gap-1 text-sm">
                {taskProvider === "asana" ? "Project" : "List"}
                <select
                  aria-label={taskProvider === "asana" ? "Project" : "List"}
                  className="h-9 rounded-md border bg-background px-2"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="">Choose…</option>
                  {targetOptions?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1 text-sm">
              Task name
              <input
                aria-label="Task name"
                className="h-9 rounded-md border bg-background px-2"
                maxLength={500}
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Details
              <textarea
                aria-label="Task details"
                className="min-h-24 rounded-md border bg-background p-2"
                maxLength={20_000}
                value={taskDetails}
                onChange={(event) => setTaskDetails(event.target.value)}
              />
            </label>
          </div>
          {taskLoading && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Loading connected destinations…
            </p>
          )}
          {taskError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {taskError}
            </p>
          )}
          {taskMessage && (
            <p role="status" className="mt-2 text-sm">
              {taskMessage}
            </p>
          )}
          <Button
            type="button"
            className="mt-3"
            size="sm"
            disabled={taskBusy || taskLoading || !targetId || !taskName.trim()}
            onClick={() => void createReviewedTask()}
          >
            {taskBusy ? "Creating…" : "Approve and create task"}
          </Button>
        </div>
      )}
      {preview &&
        ["agent", "scheduled_agent", "workflow"].includes(preview.intent) && (
          <p className="mt-3 text-xs text-muted-foreground">
            This voice action is not executed directly. Use the editable
            proposal or workflow planning handoff above.
          </p>
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
