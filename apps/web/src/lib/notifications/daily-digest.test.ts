import { describe, expect, it } from "vitest";
import {
  type DigestNotification,
  buildDailyDigestEmail,
  groupDailyDigestRecipients,
} from "./daily-digest";

const preferences = {
  notifications: {
    desktopEnabled: false,
    onlyWhenAway: false,
    hideTaskDetails: false,
    weeklyEngagementEnabled: false,
    emailEnabled: true,
    emailDigestEnabled: true,
    emailScheduledSuccess: true,
    emailScheduledFailure: true,
    emailHookFailure: true,
  },
};

const row = (
  overrides: Partial<DigestNotification> = {},
): DigestNotification => ({
  userId: "user-1",
  email: "person@example.test",
  verified: true,
  type: "scheduled_run_success",
  preferences,
  ...overrides,
});

describe("daily notification digest", () => {
  it("groups eligible events by verified opted-in user", () => {
    expect(
      groupDailyDigestRecipients([
        row(),
        row({ type: "hook_run_failure" }),
        row({ userId: "user-2", email: "other@example.test" }),
      ]),
    ).toEqual([
      { userId: "user-1", email: "person@example.test", count: 2 },
      { userId: "user-2", email: "other@example.test", count: 1 },
    ]);
  });

  it("excludes unverified, opted-out, digest-disabled, and disabled event rows", () => {
    expect(
      groupDailyDigestRecipients([
        row({ verified: false }),
        row({
          preferences: {
            notifications: {
              ...preferences.notifications,
              emailEnabled: false,
            },
          },
        }),
        row({
          preferences: {
            notifications: {
              ...preferences.notifications,
              emailDigestEnabled: false,
            },
          },
        }),
        row({
          type: "hook_run_failure",
          preferences: {
            notifications: {
              ...preferences.notifications,
              emailHookFailure: false,
            },
          },
        }),
        row({ type: "project_brain_updated" }),
      ]),
    ).toEqual([]);
  });

  it("sends a generic summary without event titles or bodies", () => {
    expect(buildDailyDigestEmail(1, "https://app.example.test")).toEqual({
      subject: "Your Void Agent daily notification summary",
      body: "You have 1 new notification from scheduled tasks and hooks.\n\nOpen Void Agent to review them: https://app.example.test/",
    });
    expect(buildDailyDigestEmail(3, "https://app.example.test").body).toContain(
      "You have 3 new notifications",
    );
  });
});
