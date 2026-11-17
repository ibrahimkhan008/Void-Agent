export type AgentAlertKind =
  | "complete"
  | "needs_approval"
  | "needs_input"
  | "error";

export type ResolvedNotificationPrefs = {
  desktopEnabled: boolean;
  onlyWhenAway: boolean;
  hideTaskDetails: boolean;
  weeklyEngagementEnabled: boolean;
  emailEnabled: boolean;
  emailDigestEnabled: boolean;
  emailScheduledSuccess: boolean;
  emailScheduledFailure: boolean;
  emailHookFailure: boolean;
};

export type AgentAlertPayload = {
  kind: AgentAlertKind;
  threadId?: string;
  title?: string;
  body?: string;
  url?: string;
};
