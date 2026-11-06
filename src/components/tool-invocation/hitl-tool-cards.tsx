"use client";

import { ChatMentionInputSuggestion } from "@/components/chat-mention-input";
import type { UseChatHelpers } from "@ai-sdk/react";
import { type ToolUIPart, type UIMessage, getToolName } from "ai";
import type { ChatMention } from "app-types/chat";
import { defaultToolMentionsFromNames, normalizeDefaultToolNames } from "lib/ai/agent/default-tool-mentions";
import { CalendarDays, CheckCircle2, Circle, Clock, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";

type AddToolResult = UseChatHelpers<UIMessage>["addToolResult"];
type Todo = {
  text: string;
  status: "pending" | "in_progress" | "completed";
};
type Question = { header: string; question: string; options?: string[] };

export function HitlToolCard({
  part,
  addToolResult,
}: {
  part: ToolUIPart;
  addToolResult?: AddToolResult;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toolName = getToolName(part);
  const input = (part.input ?? {}) as Record<string, unknown>;
  const result = (
    part.state === "output-available" ? part.output : null
  ) as Record<string, unknown> | null;
  const submit = async (output: Record<string, unknown>) => {
    if (!addToolResult || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addToolResult({
        tool: toolName as never,
        toolCallId: part.toolCallId,
        output,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (toolName === "askForPlanApproval") {
    return (
      <PlanApprovalCard
        initialTodos={(input.todos as Todo[] | undefined) ?? []}
        explainer={String(input.explainer ?? "")}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={(todos) => submit({ approved: true, todos })}
        onReject={() => submit({ approved: false, rejected: true, todos: [] })}
        onFeedback={(feedback, todos) =>
          submit({ approved: false, changesRequested: true, feedback, todos })
        }
      />
    );
  }

  if (toolName === "requestInput") {
    return (
      <RequestInputCard
        questions={(input.questions as Question[] | undefined) ?? []}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onSubmit={(answers) => submit({ answers })}
      />
    );
  }

  if (toolName === "proposeEmail") {
    return (
      <EmailDraftCard
        action={input.action === "reply" ? "reply" : "send"}
        messageId={typeof input.messageId === "string" ? input.messageId : undefined}
        initialDraft={{
          to: String(input.to ?? ""),
          subject: String(input.subject ?? ""),
          body: String(input.body ?? ""),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft, action, messageId) => {
          const response = await fetch("/api/approvals/email", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...(messageId ? { messageId } : {}), ...draft }),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this email approval");
          }
          await submit({
            approved: true,
            emailHandle: part.toolCallId,
            action,
            ...(messageId ? { messageId } : {}),
            approvedTo: draft.to,
            approvedSubject: draft.subject,
            approvedBody: draft.body,
            approvalToken: payload.approvalToken,
          });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeCalendarChange") {
    const action = input.action === "update_event" || input.action === "delete_event"
      ? input.action
      : "create_event";
    return (
      <CalendarApprovalCard
        initialDraft={{
          action,
          eventId: typeof input.eventId === "string" ? input.eventId : "",
          summary: String(input.summary ?? ""),
          start: String(input.start ?? ""),
          end: String(input.end ?? ""),
          timeZone: String(input.timeZone ?? ""),
          description: String(input.description ?? ""),
          location: String(input.location ?? ""),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/calendar", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this calendar approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeLinearIssue") {
    return (
      <LinearIssueApprovalCard
        initialDraft={{
          teamId: String(input.teamId ?? ""),
          title: String(input.title ?? ""),
          description: String(input.description ?? ""),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/linear", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Linear approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeSlackMessage") {
    return (
      <SlackMessageApprovalCard
        initialDraft={{ channelId: String(input.channelId ?? ""), text: String(input.text ?? "") }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/slack", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Slack approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeWorkflowRun") {
    return (
      <WorkflowRunApprovalCard
        initialDraft={{
          platform: input.platform === "activepieces" || input.platform === "saved-workflow" ? input.platform : "windmill",
          target: String(input.target ?? ""),
          workflowName: typeof input.workflowName === "string" ? input.workflowName : undefined,
          approvalTokenField: typeof input.approvalTokenField === "string" ? input.approvalTokenField : undefined,
          graphRevision: typeof input.graphRevision === "string" ? input.graphRevision : undefined,
          payload: JSON.stringify(input.payload ?? {}, null, 2),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/workflow-run", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft, payload: JSON.parse(draft.payload) }),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this workflow approval");
          }
          await submit({
            approved: true,
            platform: draft.platform,
            target: draft.target,
            ...(draft.workflowName ? { workflowName: draft.workflowName } : {}),
            ...(draft.approvalTokenField ? { approvalTokenField: draft.approvalTokenField } : {}),
            payload: JSON.parse(draft.payload),
            [draft.approvalTokenField || "approvalToken"]: payload.approvalToken,
          });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeMcpToolCall") {
    return (
      <McpToolApprovalCard
        initialDraft={{ serverId: String(input.serverId ?? ""), serverName: String(input.serverName ?? ""), toolName: String(input.toolName ?? ""), payload: JSON.stringify(input.payload ?? {}, null, 2) }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/mcp-tool", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft, payload: JSON.parse(draft.payload) }),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this MCP approval");
          }
          await submit({ approved: true, serverId: draft.serverId, serverName: draft.serverName, toolName: draft.toolName, payload: JSON.parse(draft.payload), approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeHttpRequest") {
    return (
      <HttpRequestApprovalCard
        initialDraft={{
          url: String(input.url ?? ""),
          method: typeof input.method === "string" ? input.method : "GET",
          headers: JSON.stringify(input.headers ?? {}, null, 2),
          body: String(input.body ?? ""),
          timeout: Number(input.timeout ?? 10_000),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const headers = JSON.parse(draft.headers) as Record<string, string>;
          const request = { url: draft.url, method: draft.method, headers, ...(draft.body ? { body: draft.body } : {}), timeout: draft.timeout };
          const response = await fetch("/api/approvals/http-request", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this HTTP request approval");
          await submit({ approved: true, ...request, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeJiraComment") {
    return (
      <JiraCommentApprovalCard
        initialDraft={{ issueKey: String(input.issueKey ?? ""), comment: String(input.comment ?? "") }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/jira", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Jira approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeZendeskComment") {
    return (
      <ZendeskCommentApprovalCard
        initialDraft={{ ticketId: String(input.ticketId ?? ""), comment: String(input.comment ?? "") }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/zendesk", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Zendesk approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeFreshdeskAction") {
    return (
      <FreshdeskActionApprovalCard
        initialDraft={input}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/freshdesk", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Freshdesk approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeExternalMessage") {
    return (
      <ExternalMessageApprovalCard
        initialDraft={{
          provider: input.provider === "discord" || input.provider === "zulip" ? input.provider : "teams",
          destination: String(input.destination ?? ""),
          topic: String(input.topic ?? "general"),
          content: String(input.content ?? ""),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/messaging", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this message approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeTaskCreation") {
    return (
      <TaskCreationApprovalCard
        initialDraft={{ provider: input.provider === "clickup" || input.provider === "productboard" ? input.provider : "asana", targetId: String(input.targetId ?? ""), name: String(input.name ?? ""), details: String(input.details ?? "") }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/task-creation", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this item approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "proposeDriveFile") {
    return (
      <DriveFileApprovalCard
        initialDraft={{ name: String(input.name ?? ""), content: String(input.content ?? "") }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onApprove={async (draft) => {
          const response = await fetch("/api/approvals/drive-file", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => null) as { approvalToken?: unknown; error?: unknown } | null;
          if (!response.ok || typeof payload?.approvalToken !== "string") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save this Drive approval");
          }
          await submit({ approved: true, ...draft, approvalToken: payload.approvalToken });
        }}
        onReject={() => submit({ approved: false, rejected: true })}
      />
    );
  }

  if (toolName === "createAgent") {
    return (
      <CreateAgentApprovalCard
        requestKey={part.toolCallId}
        initialDraft={{
          name: String(input.name ?? ""),
          description: String(input.description ?? ""),
          role: String(input.role ?? ""),
          systemPrompt: String(input.systemPrompt ?? ""),
          tools: normalizeDefaultToolNames(input.tools),
        }}
        submitted={result}
        disabled={part.state !== "input-available" || isSubmitting}
        onSubmit={submit}
      />
    );
  }

  return null;
}

type CalendarDraft = {
  action: "create_event" | "update_event" | "delete_event";
  eventId: string;
  summary: string;
  start: string;
  end: string;
  timeZone: string;
  description: string;
  location: string;
};

function ZendeskCommentApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: { ticketId: string; comment: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: { ticketId: string; comment: string }) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  if (submitted) return <div className="rounded-lg border p-3 text-sm">{submitted.approved ? "Zendesk comment approved for this exact ticket and text." : "Zendesk comment rejected."}</div>;
  const approve = async () => {
    setError("");
    try { await onApprove({ ticketId: draft.ticketId.trim(), comment: draft.comment.trim() }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve comment"); }
  };
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Review Zendesk comment</p>
      <Input aria-label="Zendesk ticket ID" value={draft.ticketId} onChange={(event) => setDraft((current) => ({ ...current, ticketId: event.target.value }))} disabled={disabled} />
      <Textarea aria-label="Zendesk comment" value={draft.comment} onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))} disabled={disabled} rows={5} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onReject} disabled={disabled}>Reject</Button>
        <Button onClick={approve} disabled={disabled || !draft.ticketId.trim() || !draft.comment.trim()}>Approve comment</Button>
      </div>
    </div>
  );
}

type FreshdeskEffectDraft =
  | { action: "add_reply"; ticketId: string; body: string }
  | { action: "create_ticket"; subject: string; description: string; requesterName: string; requesterEmail: string; status: 2 | 3 | 4 | 5; priority: 1 | 2 | 3 | 4 };

type ExternalMessageDraft = { provider: "teams" | "discord" | "zulip"; destination: string; topic?: string; content: string };

type TaskCreationDraft = { provider: "asana" | "clickup" | "productboard"; targetId: string; name: string; details: string };

function DriveFileApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: { name: string; content: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: { name: string; content: string }) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  if (submitted) return <div className="rounded-lg border p-3 text-sm">{submitted.approved ? `Drive file approved: ${draft.name}` : "Drive file creation rejected."}</div>;
  const approve = async () => {
    setError("");
    try { await onApprove({ name: draft.name.trim(), content: draft.content }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve Drive file"); }
  };
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Review Google Drive file</p>
      <Input aria-label="Drive file name" value={draft.name} maxLength={255} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} disabled={disabled} />
      <Textarea aria-label="Drive file content" value={draft.content} maxLength={50_000} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} disabled={disabled} rows={8} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onReject} disabled={disabled}>Reject</Button><Button onClick={approve} disabled={disabled || !draft.name.trim()}>Create file</Button></div>
    </div>
  );
}

function TaskCreationApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: TaskCreationDraft;
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: TaskCreationDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const itemLabel = draft.provider === "productboard" ? "feature" : "task";
  if (submitted) return <div className="rounded-lg border p-3 text-sm">{submitted.approved ? `${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} approved for ${draft.provider}.` : `${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} creation rejected.`}</div>;
  const approve = async () => {
    setError("");
    try { await onApprove({ ...draft, targetId: draft.targetId.trim(), name: draft.name.trim(), details: draft.details.trim() }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not approve ${itemLabel}`); }
  };
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Review {draft.provider} {itemLabel} creation</p>
      <Input aria-label={`${draft.provider} target ID`} value={draft.targetId} onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))} disabled={disabled} />
      <Input aria-label={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} name`} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} disabled={disabled} />
      <Textarea aria-label={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} details`} value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} disabled={disabled} rows={5} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onReject} disabled={disabled}>Reject</Button><Button onClick={approve} disabled={disabled || !draft.targetId.trim() || !draft.name.trim()}>Approve {itemLabel}</Button></div>
    </div>
  );
}

function ExternalMessageApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: ExternalMessageDraft;
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: ExternalMessageDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  if (submitted) return <div className="rounded-lg border p-3 text-sm">{submitted.approved ? `Message approved for ${draft.provider}.` : "Message rejected."}</div>;
  const approve = async () => {
    setError("");
    try {
      const payload: ExternalMessageDraft = { provider: draft.provider, destination: draft.destination.trim(), content: draft.content.trim(), ...(draft.provider === "zulip" ? { topic: (draft.topic ?? "general").trim() || "general" } : {}) };
      await onApprove(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve message"); }
  };
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Review {draft.provider} message</p>
      <Input aria-label={`${draft.provider} destination`} value={draft.destination} onChange={(event) => setDraft((current) => ({ ...current, destination: event.target.value }))} disabled={disabled} />
      {draft.provider === "zulip" && <Input aria-label="Zulip topic" value={draft.topic ?? "general"} onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))} disabled={disabled} />}
      <Textarea aria-label={`${draft.provider} message text`} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} disabled={disabled} rows={5} maxLength={draft.provider === "discord" ? 2000 : 4000} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onReject} disabled={disabled}>Reject</Button><Button onClick={approve} disabled={disabled || !draft.destination.trim() || !draft.content.trim()}>Approve message</Button></div>
    </div>
  );
}

function FreshdeskActionApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: Record<string, unknown>;
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: FreshdeskEffectDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState<FreshdeskEffectDraft>(() => initialDraft.action === "add_reply"
    ? { action: "add_reply", ticketId: String(initialDraft.ticketId ?? ""), body: String(initialDraft.body ?? "") }
    : { action: "create_ticket", subject: String(initialDraft.subject ?? ""), description: String(initialDraft.description ?? ""), requesterName: String(initialDraft.requesterName ?? ""), requesterEmail: String(initialDraft.requesterEmail ?? ""), status: initialDraft.status === 3 || initialDraft.status === 4 || initialDraft.status === 5 ? initialDraft.status : 2, priority: initialDraft.priority === 2 || initialDraft.priority === 3 || initialDraft.priority === 4 ? initialDraft.priority : 1 });
  const [error, setError] = useState("");
  if (submitted) return <div className="rounded-lg border p-3 text-sm">{submitted.approved ? "Freshdesk action approved for these exact fields." : "Freshdesk action rejected."}</div>;
  const approve = async () => {
    setError("");
    try {
      if (draft.action === "add_reply") await onApprove({ ...draft, ticketId: draft.ticketId.trim(), body: draft.body.trim() });
      else await onApprove({ ...draft, subject: draft.subject.trim(), description: draft.description.trim(), requesterName: draft.requesterName.trim(), requesterEmail: draft.requesterEmail.trim() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve Freshdesk action"); }
  };
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Review Freshdesk {draft.action === "add_reply" ? "reply" : "ticket"}</p>
      {draft.action === "add_reply" ? <>
        <Input aria-label="Freshdesk ticket ID" value={draft.ticketId} onChange={(event) => setDraft((current) => current.action === "add_reply" ? { ...current, ticketId: event.target.value } : current)} disabled={disabled} />
        <Textarea aria-label="Freshdesk reply" value={draft.body} onChange={(event) => setDraft((current) => current.action === "add_reply" ? { ...current, body: event.target.value } : current)} disabled={disabled} rows={5} />
      </> : <>
        <Input aria-label="Ticket subject" value={draft.subject} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, subject: event.target.value } : current)} disabled={disabled} />
        <Textarea aria-label="Ticket description" value={draft.description} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, description: event.target.value } : current)} disabled={disabled} rows={5} />
        <Input aria-label="Requester name" value={draft.requesterName} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, requesterName: event.target.value } : current)} disabled={disabled} />
        <Input aria-label="Requester email" type="email" value={draft.requesterEmail} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, requesterEmail: event.target.value } : current)} disabled={disabled} />
        <label className="block text-sm">Status<select aria-label="Ticket status" className="mt-1 block w-full rounded-md border bg-background p-2" value={draft.status} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, status: Number(event.target.value) as 2 | 3 | 4 | 5 } : current)} disabled={disabled}><option value={2}>Open</option><option value={3}>Pending</option><option value={4}>Resolved</option><option value={5}>Closed</option></select></label>
        <label className="block text-sm">Priority<select aria-label="Ticket priority" className="mt-1 block w-full rounded-md border bg-background p-2" value={draft.priority} onChange={(event) => setDraft((current) => current.action === "create_ticket" ? { ...current, priority: Number(event.target.value) as 1 | 2 | 3 | 4 } : current)} disabled={disabled}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option><option value={4}>Urgent</option></select></label>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onReject} disabled={disabled}>Reject</Button><Button onClick={approve} disabled={disabled}>Approve action</Button></div>
    </div>
  );
}

function LinearIssueApprovalCard({
  initialDraft,
  submitted,
  disabled,
  onApprove,
  onReject,
}: {
  initialDraft: { teamId: string; title: string; description: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: Record<string, unknown>) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  const update = (key: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const approve = async () => {
    if (disabled || isApproving || !draft.teamId.trim() || !draft.title.trim()) return;
    setIsApproving(true);
    try {
      await onApprove({ teamId: draft.teamId.trim(), title: draft.title.trim(), ...(draft.description ? { description: draft.description } : {}) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this approval");
    } finally {
      setIsApproving(false);
    }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (approved ? "Linear issue approved" : "Linear issue rejected") : "Review Linear issue"}</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Team ID</span>{settled ? <p className="break-all">{draft.teamId}</p> : <Input maxLength={36} value={draft.teamId} onChange={(event) => update("teamId", event.target.value)} disabled={disabled} placeholder="Linear team UUID" />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Title</span>{settled ? <p>{draft.title}</p> : <Input maxLength={300} value={draft.title} onChange={(event) => update("title", event.target.value)} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Description</span>{settled ? <p className="whitespace-pre-wrap">{draft.description || "No description"}</p> : <Textarea maxLength={10_000} rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.teamId.trim() || !draft.title.trim()} onClick={() => void approve()}>{isApproving ? "Approving…" : "Approve issue creation"}</Button></div>}
    </section>
  );
}

function SlackMessageApprovalCard({
  initialDraft,
  submitted,
  disabled,
  onApprove,
  onReject,
}: {
  initialDraft: { channelId: string; text: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: Record<string, unknown>) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  const approve = async () => {
    if (disabled || isApproving || !draft.channelId.trim() || !draft.text.trim()) return;
    setIsApproving(true);
    try { await onApprove({ channelId: draft.channelId.trim(), text: draft.text.trim() }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save this approval"); }
    finally { setIsApproving(false); }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (approved ? "Slack message approved" : "Slack message rejected") : "Review Slack message"}</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Channel ID</span>{settled ? <p className="break-all">{draft.channelId}</p> : <Input maxLength={80} value={draft.channelId} onChange={(event) => setDraft((current) => ({ ...current, channelId: event.target.value }))} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Message</span>{settled ? <p className="whitespace-pre-wrap">{draft.text}</p> : <Textarea maxLength={4000} rows={5} value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.channelId.trim() || !draft.text.trim()} onClick={() => void approve()}>{isApproving ? "Approving…" : "Approve and post"}</Button></div>}
    </section>
  );
}

function HttpRequestApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: { url: string; method: string; headers: string; body: string; timeout: number };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: typeof initialDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approve = async () => {
    if (disabled || isApproving) return;
    try {
      const headers = JSON.parse(draft.headers) as unknown;
      if (!headers || Array.isArray(headers) || typeof headers !== "object" || Object.values(headers).some((value) => typeof value !== "string")) throw new Error("Headers must be a JSON object with string values");
      setIsApproving(true);
      await onApprove({ ...draft, url: draft.url.trim(), method: draft.method.toUpperCase(), headers: JSON.stringify(headers), timeout: Math.max(1000, Math.min(30_000, Math.trunc(draft.timeout))) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this approval");
    } finally { setIsApproving(false); }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (submitted?.approved === true ? "HTTP request approved" : "HTTP request rejected") : "Review outbound HTTP request"}</p>
      <p className="text-sm text-muted-foreground">Only HTTPS public hosts are allowed. Redirects are blocked. Review any credentials in the URL, headers, or body before approving.</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">URL</span>{settled ? <p className="break-all">{draft.url}</p> : <Input maxLength={2048} value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Method</span>{settled ? <p>{draft.method}</p> : <select className="h-10 w-full rounded-md border bg-background px-3" value={draft.method} onChange={(event) => setDraft((current) => ({ ...current, method: event.target.value }))} disabled={disabled}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => <option key={method}>{method}</option>)}</select>}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Headers (JSON)</span>{settled ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border p-2 text-xs">{draft.headers}</pre> : <Textarea maxLength={8000} rows={4} value={draft.headers} onChange={(event) => setDraft((current) => ({ ...current, headers: event.target.value }))} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Body</span>{settled ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border p-2 text-xs">{draft.body}</pre> : <Textarea maxLength={16_000} rows={5} value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.url.trim()} onClick={() => void approve()}>{isApproving ? "Approving..." : "Approve request"}</Button></div>}
    </section>
  );
}

function McpToolApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: { serverId: string; serverName: string; toolName: string; payload: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: typeof initialDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  const approve = async () => {
    if (disabled || isApproving || !draft.serverId.trim() || !draft.serverName.trim() || !draft.toolName.trim()) return;
    let parsed: unknown;
    try { parsed = JSON.parse(draft.payload); } catch { toast.error("Arguments must be valid JSON"); return; }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") { toast.error("Arguments must be a JSON object"); return; }
    setIsApproving(true);
    try { await onApprove({ ...draft, serverId: draft.serverId.trim(), serverName: draft.serverName.trim(), toolName: draft.toolName.trim() }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save this MCP approval"); }
    finally { setIsApproving(false); }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (approved ? "MCP call approved" : "MCP call rejected") : "Review remote MCP call"}</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Server</span>{settled ? <p>{draft.serverName} <span className="text-xs">({draft.serverId})</span></p> : <Input maxLength={128} value={draft.serverName} onChange={(event) => setDraft((current) => ({ ...current, serverName: event.target.value }))} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Tool name</span>{settled ? <p>{draft.toolName}</p> : <Input maxLength={128} value={draft.toolName} onChange={(event) => setDraft((current) => ({ ...current, toolName: event.target.value }))} disabled={disabled} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Complete JSON arguments</span>{settled ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs">{draft.payload}</pre> : <Textarea maxLength={16_000} rows={8} value={draft.payload} onChange={(event) => setDraft((current) => ({ ...current, payload: event.target.value }))} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.toolName.trim()} onClick={() => void approve()}>{isApproving ? "Approving..." : "Approve and call tool"}</Button></div>}
    </section>
  );
}

function WorkflowRunApprovalCard({
  initialDraft, submitted, disabled, onApprove, onReject,
}: {
  initialDraft: { platform: "windmill" | "activepieces" | "saved-workflow"; target: string; workflowName?: string; approvalTokenField?: string; graphRevision?: string; payload: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: typeof initialDraft) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const [review, setReview] = useState<{ graphRevision: string; effects: string[] } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  useEffect(() => {
    if (draft.platform !== "saved-workflow" || !draft.workflowName) return;
    let active = true;
    void fetch("/api/approvals/workflow-run", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewWorkflowId: draft.target, workflowName: draft.workflowName }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { graphRevision?: unknown; effects?: unknown; error?: unknown } | null;
      if (!response.ok || typeof payload?.graphRevision !== "string" || !Array.isArray(payload.effects) || !payload.effects.every((item) => typeof item === "string")) throw new Error(typeof payload?.error === "string" ? payload.error : "Could not inspect workflow actions");
      if (active) setReview({ graphRevision: payload.graphRevision, effects: payload.effects as string[] });
    }).catch((error) => { if (active) setReviewError(error instanceof Error ? error.message : "Could not inspect workflow actions"); });
    return () => { active = false; };
  }, [draft.platform, draft.target, draft.workflowName]);
  const approve = async () => {
    if (disabled || isApproving || !draft.target.trim() || (draft.platform === "saved-workflow" && !review)) return;
    let parsed: unknown;
    try { parsed = JSON.parse(draft.payload); } catch { toast.error("Payload must be valid JSON"); return; }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") { toast.error("Payload must be a JSON object"); return; }
    setIsApproving(true);
    try { await onApprove({ ...draft, target: draft.target.trim(), ...(review ? { graphRevision: review.graphRevision } : {}) }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save this workflow approval"); }
    finally { setIsApproving(false); }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (approved ? "Workflow run approved" : "Workflow run rejected") : draft.platform === "saved-workflow" ? "Review saved workflow run" : "Review automation run"}</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Platform</span><p>{draft.platform === "saved-workflow" ? "Void-Agent workflow" : draft.platform}</p></label>
      {draft.workflowName && <p className="text-sm"><span className="text-muted-foreground">Workflow: </span>{draft.workflowName}</p>}
      {draft.platform === "saved-workflow" && !settled && <div className="rounded-md border p-3 text-sm"><p className="mb-2 font-medium">Actions in this workflow</p>{review ? <ul className="list-disc space-y-1 pl-5">{review.effects.map((effect, index) => <li key={`${index}-${effect}`}>{effect}</li>)}</ul> : <p className="text-muted-foreground">{reviewError ?? "Inspecting workflow actions…"}</p>}</div>}
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{draft.platform === "saved-workflow" ? "Workflow ID" : "Target"}</span>{settled ? <p className="break-all">{draft.target}</p> : <Input maxLength={256} value={draft.target} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))} disabled={disabled || draft.platform === "saved-workflow"} />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Complete JSON payload</span>{settled ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs">{draft.payload}</pre> : <Textarea maxLength={16_000} rows={8} value={draft.payload} onChange={(event) => setDraft((current) => ({ ...current, payload: event.target.value }))} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.target.trim() || (draft.platform === "saved-workflow" && !review)} onClick={() => void approve()}>{isApproving ? "Approving..." : "Approve and run"}</Button></div>}
    </section>
  );
}

function JiraCommentApprovalCard({
  initialDraft,
  submitted,
  disabled,
  onApprove,
  onReject,
}: {
  initialDraft: { issueKey: string; comment: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: Record<string, unknown>) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  const approve = async () => {
    if (disabled || isApproving || !draft.issueKey.trim() || !draft.comment.trim()) return;
    setIsApproving(true);
    try {
      await onApprove({ issueKey: draft.issueKey.trim(), comment: draft.comment.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this approval");
    } finally {
      setIsApproving(false);
    }
  };
  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">{settled ? (approved ? "Jira comment approved" : "Jira comment rejected") : "Review Jira comment"}</p>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Issue key</span>{settled ? <p className="break-all">{draft.issueKey}</p> : <Input maxLength={80} value={draft.issueKey} onChange={(event) => setDraft((current) => ({ ...current, issueKey: event.target.value }))} disabled={disabled} placeholder="PROJ-123" />}</label>
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Comment</span>{settled ? <p className="whitespace-pre-wrap">{draft.comment}</p> : <Textarea maxLength={10_000} rows={5} value={draft.comment} onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))} disabled={disabled} />}</label>
      {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button disabled={disabled || isApproving || !draft.issueKey.trim() || !draft.comment.trim()} onClick={() => void approve()}>{isApproving ? "Approving…" : "Approve and comment"}</Button></div>}
    </section>
  );
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CalendarApprovalCard({
  initialDraft,
  submitted,
  disabled,
  onApprove,
  onReject,
}: {
  initialDraft: CalendarDraft;
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: Record<string, unknown>) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    ...initialDraft,
    start: toLocalDateTime(initialDraft.start),
    end: toLocalDateTime(initialDraft.end),
  }));
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const approved = submitted?.approved === true;
  const deleting = draft.action === "delete_event";
  const set = (key: keyof CalendarDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const approve = async () => {
    if (disabled || isApproving || !draft.summary.trim() || !draft.start || !draft.end) return;
    const start = new Date(draft.start);
    const end = new Date(draft.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      toast.error("Choose a valid event time range");
      return;
    }
    setIsApproving(true);
    try {
      await onApprove({
        action: draft.action,
        ...(draft.action !== "create_event" ? { eventId: draft.eventId.trim() } : {}),
        summary: draft.summary.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        ...(!deleting && draft.timeZone.trim() ? { timeZone: draft.timeZone.trim() } : {}),
        ...(!deleting && draft.description ? { description: draft.description } : {}),
        ...(!deleting && draft.location ? { location: draft.location } : {}),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this approval");
    } finally {
      setIsApproving(false);
    }
  };
  const readOnly = settled || deleting;
  return (
    <section className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="flex items-center gap-2 border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
        {deleting ? <Trash2 className="size-4" /> : <CalendarDays className="size-4" />}
        {settled ? (approved ? "Calendar change approved" : "Calendar change rejected") : `Review ${deleting ? "event deletion" : draft.action === "update_event" ? "event update" : "new event"}`}
      </header>
      <div className="space-y-3 px-4 py-3">
        {draft.action !== "create_event" && <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Event ID</span><p className="break-all">{draft.eventId}</p></label>}
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Title</span>{readOnly ? <p>{draft.summary}</p> : <Input maxLength={300} value={draft.summary} onChange={(e) => set("summary", e.target.value)} disabled={disabled} />}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Starts (your local time)</span>{readOnly ? <p>{draft.start}</p> : <Input type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} disabled={disabled} />}</label>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Ends (your local time)</span>{readOnly ? <p>{draft.end}</p> : <Input type="datetime-local" value={draft.end} onChange={(e) => set("end", e.target.value)} disabled={disabled} />}</label>
        </div>
        {!deleting && <>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Time zone (optional)</span><Input maxLength={80} value={draft.timeZone} onChange={(e) => set("timeZone", e.target.value)} disabled={disabled || settled} placeholder="America/Los_Angeles" /></label>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Location (optional)</span><Input maxLength={500} value={draft.location} onChange={(e) => set("location", e.target.value)} disabled={disabled || settled} /></label>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Description (optional)</span><Textarea maxLength={4000} rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} disabled={disabled || settled} /></label>
        </>}
        {!settled && <div className="flex justify-end gap-2"><Button variant="outline" disabled={disabled || isApproving} onClick={onReject}>Reject</Button><Button variant={deleting ? "destructive" : "default"} disabled={disabled || isApproving || !draft.summary.trim() || (draft.action !== "create_event" && !draft.eventId.trim())} onClick={() => void approve()}>{isApproving ? "Saving approval…" : deleting ? "Approve deletion" : "Approve calendar change"}</Button></div>}
        {settled && !approved && <p className="text-sm text-muted-foreground">No calendar change was approved or executed.</p>}
      </div>
    </section>
  );
}

function CreateAgentApprovalCard({
  requestKey,
  initialDraft,
  submitted,
  disabled,
  onSubmit,
}: {
  requestKey: string;
  initialDraft: {
    name: string;
    description: string;
    role: string;
    systemPrompt: string;
    tools: string[];
  };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onSubmit: (result: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(
    submitted?.created === true && typeof submitted.agentId === "string"
      ? {
          id: submitted.agentId,
          name: String(submitted.agentName ?? initialDraft.name),
        }
      : null,
  );
  const update = (key: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const finish = async (result: Record<string, unknown>) => {
    if (disabled) return;
    await onSubmit(result);
  };

  const create = async () => {
    if (
      isCreating ||
      created ||
      !draft.name.trim() ||
      !draft.systemPrompt.trim()
    )
      return;
    setIsCreating(true);
    let writeSucceeded = false;
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          // The API replaces this with the authenticated session user ID.
          userId: "chat-approval",
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          instructions: {
            role: draft.role.trim() || undefined,
            systemPrompt: draft.systemPrompt.trim(),
            mentions: defaultToolMentionsFromNames(draft.tools),
          },
        }),
      });
      if (response.status === 409) {
        throw new Error(
          "This approval key was already used for a different draft. Restore the approved draft to retry safely.",
        );
      }
      if (response.status === 410) {
        throw new Error(
          "This approval already created an agent that was later deleted. Ask the assistant to make a new proposal.",
        );
      }
      if (!response.ok) throw new Error("Agent creation failed. Please retry.");
      const agent = (await response.json()) as { id?: unknown; name?: unknown };
      if (typeof agent.id !== "string" || typeof agent.name !== "string") {
        throw new Error("Invalid agent response");
      }
      setCreated({ id: agent.id, name: agent.name });
      writeSucceeded = true;
      await finish({ created: true, agentId: agent.id, agentName: agent.name });
    } catch (error) {
      toast.error(
        writeSucceeded
          ? "Agent was created, but its result could not be returned. Retry below."
          : error instanceof Error
            ? error.message
            : "Could not create the agent. Check your access and try again.",
      );
      // Keep the proposal editable; if creation already succeeded, created is
      // set before returning its result and the retry button will only answer
      // the parked tool call, avoiding a duplicate agent write.
    } finally {
      setIsCreating(false);
    }
  };

  if (created || submitted?.created === true) {
    const id = created?.id ?? String(submitted?.agentId ?? "");
    const name = created?.name ?? String(submitted?.agentName ?? "Agent");
    return (
      <section className="my-3 rounded-lg border bg-background p-4">
        <p className="font-medium">Agent created</p>
        <Link
          className="text-sm underline"
          href={`/agent/${encodeURIComponent(id)}`}
        >
          {name}
        </Link>
        {created && !submitted && (
          <div className="mt-3">
            <Button
              disabled={disabled}
              onClick={() =>
                void finish({ created: true, agentId: id, agentName: name })
              }
              size="sm"
            >
              Return result to chat
            </Button>
          </div>
        )}
      </section>
    );
  }

  if (submitted?.rejected === true) {
    return (
      <p className="my-3 rounded-lg border p-4 text-sm">
        Agent proposal rejected.
      </p>
    );
  }

  return (
    <section className="my-3 space-y-3 rounded-lg border bg-background p-4">
      <p className="font-medium">Review agent proposal</p>
      <label className="block space-y-1 text-sm">
        <span>Name</span>
        <Input
          disabled={disabled || isCreating}
          maxLength={100}
          value={draft.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Description</span>
        <Input
          disabled={disabled || isCreating}
          maxLength={8000}
          value={draft.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Role</span>
        <Input
          disabled={disabled || isCreating}
          maxLength={200}
          value={draft.role}
          onChange={(event) => update("role", event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Instructions</span>
        <Textarea
          disabled={disabled || isCreating}
          maxLength={12000}
          rows={8}
          value={draft.systemPrompt}
          onChange={(event) => update("systemPrompt", event.target.value)}
        />
      </label>
      <div className="space-y-1.5">
        <p className="text-sm">Built-in tools</p>
        <p className="text-xs text-muted-foreground">
          Select up to 20 built-in tools. Any tool still follows its existing
          permission and approval checks.
        </p>
        <ChatMentionInputSuggestion
          onSelectMention={(item) => {
            try {
              const mention = JSON.parse(item.id) as Partial<ChatMention>;
              if (mention.type !== "defaultTool" || typeof mention.name !== "string") return;
              const [toolName] = normalizeDefaultToolNames([mention.name]);
              if (!toolName) return;
              setDraft((current) => {
                const tools = normalizeDefaultToolNames(current.tools);
                if (tools.includes(toolName)) {
                  return { ...current, tools: tools.filter((tool) => tool !== toolName) };
                }
                if (tools.length >= 20) {
                  toast.error("An agent can use at most 20 built-in tools.");
                  return current;
                }
                return { ...current, tools: [...tools, toolName] };
              });
            } catch {
              // Ignore malformed picker payloads; only catalog mentions are accepted.
            }
          }}
          onClose={() => setToolPickerOpen(false)}
          top={0}
          left={0}
          selectedIds={draft.tools}
          open={toolPickerOpen && !disabled && !isCreating}
          onOpenChange={setToolPickerOpen}
          disabledType={["mcp", "workflow", "agent"]}
        >
          <Button
            type="button"
            variant="outline"
            disabled={disabled || isCreating}
            aria-expanded={toolPickerOpen}
          >
            {draft.tools.length > 0 ? `${draft.tools.length} selected` : "Choose tools"}
          </Button>
        </ChatMentionInputSuggestion>
        {draft.tools.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Selected built-in tools">
            {normalizeDefaultToolNames(draft.tools).map((tool) => (
              <li key={tool} className="rounded-md border bg-muted px-2 py-0.5 text-xs">
                {tool}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          disabled={disabled || isCreating}
          onClick={() => void finish({ created: false, rejected: true })}
          variant="outline"
        >
          Reject
        </Button>
        <Button
          disabled={
            disabled ||
            isCreating ||
            !draft.name.trim() ||
            !draft.systemPrompt.trim()
          }
          onClick={() => void create()}
        >
          {isCreating ? "Creating…" : "Create agent"}
        </Button>
      </div>
    </section>
  );
}

function EmailDraftCard({
  action,
  messageId,
  initialDraft,
  submitted,
  disabled,
  onApprove,
  onReject,
}: {
  action: "send" | "reply";
  messageId?: string;
  initialDraft: { to: string; subject: string; body: string };
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (draft: { to: string; subject: string; body: string }, action: "send" | "reply", messageId?: string) => Promise<void>;
  onReject: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const settled = submitted !== null;
  const rejected = submitted?.rejected === true;
  const approved = submitted?.approved === true;
  const recipient = String(submitted?.approvedTo ?? draft.to);
  const subject = String(submitted?.approvedSubject ?? draft.subject);
  const body = String(submitted?.approvedBody ?? draft.body);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.to.trim());

  const update = (key: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const approve = async () => {
    if (disabled || isApproving || !valid || !draft.subject.trim() || !draft.body.trim()) return;
    setIsApproving(true);
    try {
      await onApprove({ to: draft.to.trim(), subject: draft.subject.trim(), body: draft.body.trim() }, action, messageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this approval");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <section className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
        {settled
          ? approved
            ? `${action === "reply" ? "Reply" : "Email"} draft approved`
            : `${action === "reply" ? "Reply" : "Email"} draft rejected`
          : `Review ${action === "reply" ? "reply" : "email draft"}`}
      </header>
      <div className="space-y-3 px-4 py-3">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">To</span>
          {settled ? (
            <p className="break-all">{recipient}</p>
          ) : (
            <Input
              autoComplete="email"
              disabled={disabled}
              maxLength={320}
              onChange={(event) => update("to", event.target.value)}
              type="email"
              value={draft.to}
            />
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Subject</span>
          {settled ? (
            <p className="break-words">{subject}</p>
          ) : (
            <Input
              disabled={disabled}
              maxLength={500}
              onChange={(event) => update("subject", event.target.value)}
              value={draft.subject}
            />
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Message</span>
          {settled ? (
            <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2">
              {body}
            </p>
          ) : (
            <Textarea
              disabled={disabled}
              maxLength={12000}
              onChange={(event) => update("body", event.target.value)}
              rows={8}
              value={draft.body}
            />
          )}
        </label>
        {!settled && (
          <div className="flex justify-end gap-2">
            <Button disabled={disabled} onClick={onReject} variant="outline">
              Reject
            </Button>
            <Button
              disabled={disabled || isApproving || !valid || !draft.subject.trim() || !draft.body.trim()}
              onClick={() => void approve()}
            >
              {isApproving ? "Saving approval..." : "Approve draft"}
            </Button>
          </div>
        )}
        {settled && rejected && (
          <p className="text-sm text-muted-foreground">
            This draft was not approved. Do not send it.
          </p>
        )}
      </div>
    </section>
  );
}

function PlanApprovalCard({
  initialTodos,
  explainer,
  submitted,
  disabled,
  onApprove,
  onReject,
  onFeedback,
}: {
  initialTodos: Todo[];
  explainer: string;
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onApprove: (todos: Todo[]) => void;
  onReject: () => void;
  onFeedback: (feedback: string, todos: Todo[]) => void;
}) {
  const [todos, setTodos] = useState(initialTodos);
  const [feedback, setFeedback] = useState("");
  const settled = submitted !== null;
  const approvedTodos = (submitted?.todos as Todo[] | undefined) ?? [];
  const isApproved = submitted?.approved === true;
  const isRejected = submitted?.rejected === true;

  return (
    <section className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
        Review plan{" "}
        {settled ? (isApproved ? "- approved" : "- not approved") : ""}
      </header>
      <div className="space-y-3 px-4 py-3">
        {explainer && (
          <p className="text-sm text-muted-foreground">{explainer}</p>
        )}
        <ul className="space-y-2">
          {(settled ? approvedTodos : todos).map((todo, index) => {
            const Icon =
              todo.status === "completed"
                ? CheckCircle2
                : todo.status === "in_progress"
                  ? Clock
                  : Circle;
            return (
              <li
                key={`${index}-${todo.text}`}
                className="flex items-center gap-2"
              >
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                {settled ? (
                  <span className="text-sm">{todo.text}</span>
                ) : (
                  <Input
                    aria-label={`Plan step ${index + 1}`}
                    disabled={disabled}
                    maxLength={500}
                    value={todo.text}
                    onChange={(event) =>
                      setTodos((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                )}
                {!settled && (
                  <Button
                    aria-label={`Remove plan step ${index + 1}`}
                    disabled={disabled || todos.length <= 1}
                    onClick={() =>
                      setTodos((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    size="icon"
                    variant="ghost"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!settled && (
          <>
            <Textarea
              aria-label="Request a plan change"
              disabled={disabled}
              maxLength={2000}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Suggest a change or ask a question (optional)"
              value={feedback}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={disabled} onClick={onReject} variant="outline">
                Reject plan
              </Button>
              {feedback.trim() && (
                <Button
                  disabled={disabled}
                  onClick={() => onFeedback(feedback.trim(), todos)}
                  variant="secondary"
                >
                  Request changes
                </Button>
              )}
              <Button
                disabled={disabled || todos.some((todo) => !todo.text.trim())}
                onClick={() =>
                  onApprove(
                    todos.map((todo) => ({ ...todo, text: todo.text.trim() })),
                  )
                }
              >
                Approve plan
              </Button>
            </div>
          </>
        )}
        {settled && isRejected && (
          <p className="text-sm text-muted-foreground">
            The plan was rejected.
          </p>
        )}
        {settled && submitted.changesRequested === true && (
          <p className="text-sm text-muted-foreground">
            Changes requested: {String(submitted.feedback ?? "")}
          </p>
        )}
      </div>
    </section>
  );
}

function RequestInputCard({
  questions,
  submitted,
  disabled,
  onSubmit,
}: {
  questions: Question[];
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onSubmit: (
    answers: { header: string; question: string; value: string }[],
  ) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const submittedAnswers = submitted?.answers as
    | { header: string; question: string; value: string }[]
    | undefined;
  const settled = Boolean(submittedAnswers);
  const canSubmit = answers.every((answer) => answer.trim().length > 0);

  return (
    <section className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
        {settled ? "Answers submitted" : "A few details"}
      </header>
      <div className="space-y-4 px-4 py-3">
        {questions.map((question, index) => (
          <div className="space-y-2" key={`${question.header}-${index}`}>
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {question.header}
            </div>
            <p className="text-sm">{question.question}</p>
            {settled ? (
              <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">
                {submittedAnswers?.[index]?.value}
              </p>
            ) : (
              <>
                {question.options?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => (
                      <Button
                        aria-pressed={answers[index] === option}
                        disabled={disabled}
                        key={option}
                        onClick={() =>
                          setAnswers((current) =>
                            current.map((value, i) =>
                              i === index ? option : value,
                            ),
                          )
                        }
                        size="sm"
                        variant={
                          answers[index] === option ? "secondary" : "outline"
                        }
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <Input
                  aria-label={question.question}
                  disabled={disabled}
                  maxLength={2000}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                  value={answers[index]}
                />
              </>
            )}
          </div>
        ))}
        {!settled && (
          <div className="flex justify-end">
            <Button
              disabled={disabled || !canSubmit}
              onClick={() =>
                onSubmit(
                  questions.map((question, index) => ({
                    header: question.header,
                    question: question.question,
                    value: answers[index].trim(),
                  })),
                )
              }
            >
              Send answers
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
