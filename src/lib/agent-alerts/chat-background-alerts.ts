export type ChatBackgroundAlertKind =
  | "complete"
  | "error"
  | "needs_approval"
  | "needs_input";

export type ChatBackgroundAlert = {
  kind: ChatBackgroundAlertKind;
  threadId: string;
  eventId: string;
};

export type ChatBackgroundAlertEligibility = {
  enabled: boolean;
  away: boolean;
  permission: NotificationPermission | "unsupported";
};

export type ChatBackgroundAlertPreferences = {
  enabled: boolean;
  onlyWhenAway: boolean;
};

/** Preserve the existing foreground alert behavior unless the user opts in. */
export function resolveChatBackgroundAlertPreferences(
  value: unknown,
): ChatBackgroundAlertPreferences {
  const notifications =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    enabled: notifications.backgroundChatAlerts === true,
    onlyWhenAway: notifications.chatAlertsOnlyWhenAway === true,
  };
}

export function isViewingChatThread(
  threadId: string,
  pathname: string,
  hidden: boolean,
): boolean {
  return !hidden && pathname === chatBackgroundAlertHref(threadId);
}

export function isChatBackgroundAlertEnabled(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "backgroundChatAlerts" in value &&
    value.backgroundChatAlerts === true
  );
}

export function shouldSendChatBackgroundAlert(
  eligibility: ChatBackgroundAlertEligibility,
): boolean {
  return (
    eligibility.enabled &&
    eligibility.away &&
    eligibility.permission === "granted"
  );
}

export function shouldSendChatForegroundAlert(
  enabled: boolean,
  hidden: boolean,
  onlyWhenAway = false,
): boolean {
  return enabled && !hidden && !onlyWhenAway;
}

export function isChatUserAway(hidden: boolean, focused: boolean): boolean {
  return hidden || !focused;
}

export function chatBackgroundAlertCopy(kind: ChatBackgroundAlertKind): {
  title: string;
  body: string;
} {
  switch (kind) {
    case "complete":
      return {
        title: "Void-Agent response ready",
        body: "Your chat response is ready.",
      };
    case "error":
      return {
        title: "Void-Agent response issue",
        body: "A chat response needs attention.",
      };
    case "needs_approval":
      return {
        title: "Void-Agent needs your approval",
        body: "A chat is waiting for your review.",
      };
    case "needs_input":
      return {
        title: "Void-Agent needs your input",
        body: "A chat is waiting for your response.",
      };
  }
}

export function chatBackgroundAlertHref(threadId: string): string {
  return `/chat/${encodeURIComponent(threadId)}`;
}

export function createChatBackgroundAlertDeduper(limit = 512) {
  const seen = new Set<string>();
  return {
    claim(alert: ChatBackgroundAlert): boolean {
      const key = `${alert.threadId}:${alert.kind}:${alert.eventId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > limit) {
        const oldest = seen.values().next().value;
        if (oldest) seen.delete(oldest);
      }
      return true;
    },
  };
}
