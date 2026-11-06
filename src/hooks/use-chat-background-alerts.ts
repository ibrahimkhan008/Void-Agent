"use client";

import { type UIMessage, getToolName, isToolUIPart } from "ai";
import type { UserPreferences } from "app-types/user";
import {
  type ChatBackgroundAlert,
  type ChatBackgroundAlertKind,
  chatBackgroundAlertCopy,
  createChatBackgroundAlertDeduper,
  isChatBackgroundAlertEnabled,
  shouldSendChatBackgroundAlert,
} from "lib/agent-alerts/chat-background-alerts";
import { fetcher } from "lib/utils";
import { useEffect, useRef } from "react";
import useSWR from "swr";

const deduper = createChatBackgroundAlertDeduper();

export function findPendingUserAction(messages: UIMessage[]): {
  eventId: string;
  kind: "needs_approval" | "needs_input";
} | null {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "assistant") return null;

  for (const part of lastMessage.parts) {
    if (!isToolUIPart(part)) continue;
    const toolName = String(getToolName(part));
    if (toolName === "requestInput" && part.state === "input-available") {
      return { eventId: part.toolCallId, kind: "needs_input" };
    }
    if (
      part.state === "input-available" &&
      (toolName === "createAgent" ||
        toolName === "askForPlanApproval" ||
        toolName.startsWith("propose"))
    ) {
      return { eventId: part.toolCallId, kind: "needs_approval" };
    }
  }
  return null;
}

function notify(alert: ChatBackgroundAlert): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (
    !shouldSendChatBackgroundAlert({
      enabled: true,
      hidden: document.hidden,
      permission:
        "Notification" in window ? Notification.permission : "unsupported",
    }) ||
    !deduper.claim(alert)
  ) {
    return;
  }

  const copy = chatBackgroundAlertCopy(alert.kind);
  const notification = new Notification(copy.title, {
    body: copy.body,
    tag: `${alert.threadId}:${alert.kind}:${alert.eventId}`,
    icon: "/favicon.ico",
  });
  notification.onclick = () => {
    notification.close();
    window.focus();
    window.location.assign(`/chat/${encodeURIComponent(alert.threadId)}`);
  };
}

export function useChatBackgroundAlerts({
  threadId,
  messages,
  status,
}: {
  threadId: string;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
}) {
  const { data: preferences } = useSWR<UserPreferences>(
    "/api/user/preferences",
    fetcher,
  );
  const enabled = isChatBackgroundAlertEnabled(preferences?.notifications);
  const previous = useRef({ threadId, status });

  useEffect(() => {
    const before = previous.current;
    previous.current = { threadId, status };
    if (before.threadId !== threadId) return;

    let kind: ChatBackgroundAlertKind | null = null;
    if (
      (before.status === "streaming" || before.status === "submitted") &&
      status === "ready"
    ) {
      kind = "complete";
    } else if (before.status !== "error" && status === "error") {
      kind = "error";
    }

    const latestMessage = messages.at(-1);
    const pendingUserAction = findPendingUserAction(messages);
    if (kind === "complete" && pendingUserAction) kind = null;
    if (enabled && kind) {
      notify({
        kind,
        threadId,
        eventId: latestMessage?.id ?? `${threadId}:${kind}`,
      });
    }
  }, [enabled, messages, status, threadId]);

  useEffect(() => {
    if (!enabled) return;
    const pending = findPendingUserAction(messages);
    if (!pending) return;
    notify({ ...pending, threadId });
  }, [enabled, messages, threadId]);
}
