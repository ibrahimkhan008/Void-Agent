"use client";

import { type UIMessage, getToolName, isToolUIPart } from "ai";
import type { UserPreferences } from "app-types/user";
import {
  type ChatBackgroundAlert,
  type ChatBackgroundAlertKind,
  chatBackgroundAlertCopy,
  chatBackgroundAlertHref,
  createChatBackgroundAlertDeduper,
  isChatUserAway,
  isViewingChatThread,
  resolveChatBackgroundAlertPreferences,
  shouldSendChatBackgroundAlert,
  shouldSendChatForegroundAlert,
} from "lib/agent-alerts/chat-background-alerts";
import { fetcher } from "lib/utils";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
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

function notify(
  alert: ChatBackgroundAlert,
  preferences: { enabled: boolean; onlyWhenAway: boolean },
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const focused = document.hasFocus();
  const away = isChatUserAway(document.hidden, focused);
  if (
    isViewingChatThread(
      alert.threadId,
      window.location.pathname,
      document.hidden,
    )
  ) {
    return;
  }
  if (preferences.onlyWhenAway && !away) return;

  const desktopNotifications = window.desktop?.notifications;
  if (away && desktopNotifications) {
    if (deduper.claim(alert)) {
      void desktopNotifications
        .show({
          kind: alert.kind,
          threadId: alert.threadId,
        })
        .catch(() => undefined);
    }
    return;
  }
  if (!away && !preferences.onlyWhenAway) {
    if (
      !shouldSendChatForegroundAlert(
        preferences.enabled,
        document.hidden,
        preferences.onlyWhenAway,
      ) ||
      !deduper.claim(alert)
    ) {
      return;
    }
    const copy = chatBackgroundAlertCopy(alert.kind);
    toast(copy.title, {
      description: copy.body,
      id: `${alert.threadId}:${alert.kind}:${alert.eventId}`,
      action: {
        label: "Open chat",
        onClick: () =>
          window.location.assign(chatBackgroundAlertHref(alert.threadId)),
      },
    });
    return;
  }
  if (
    !shouldSendChatBackgroundAlert({
      enabled: preferences.enabled,
      away,
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
    window.location.assign(chatBackgroundAlertHref(alert.threadId));
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
  const alertPreferences = useMemo(
    () => resolveChatBackgroundAlertPreferences(preferences?.notifications),
    [
      preferences?.notifications?.backgroundChatAlerts,
      preferences?.notifications?.chatAlertsOnlyWhenAway,
    ],
  );
  const enabled = alertPreferences.enabled;
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
      notify(
        {
          kind,
          threadId,
          eventId: latestMessage?.id ?? `${threadId}:${kind}`,
        },
        alertPreferences,
      );
    }
  }, [alertPreferences, enabled, messages, status, threadId]);

  useEffect(() => {
    if (!enabled) return;
    const pending = findPendingUserAction(messages);
    if (!pending) return;
    notify({ ...pending, threadId }, alertPreferences);
  }, [alertPreferences, enabled, messages, threadId]);
}
