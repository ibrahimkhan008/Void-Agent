import { describe, expect, it } from "vitest";
import { resolveNotificationPrefs } from "./resolve-notification-prefs";

describe("resolveNotificationPrefs", () => {
  it("defaults all notification prefs to on except hideTaskDetails", () => {
    expect(resolveNotificationPrefs(undefined)).toEqual({
      desktopEnabled: true,
      onlyWhenAway: true,
      hideTaskDetails: false,
      weeklyEngagementEnabled: true,
      emailEnabled: false,
      emailDigestEnabled: false,
      emailScheduledSuccess: true,
      emailScheduledFailure: true,
      emailHookFailure: true,
    });
  });

  it("merges partial overrides", () => {
    expect(
      resolveNotificationPrefs({
        desktopEnabled: false,
        onlyWhenAway: true,
        hideTaskDetails: true,
        weeklyEngagementEnabled: false,
        emailEnabled: true,
        emailDigestEnabled: false,
        emailScheduledSuccess: true,
        emailScheduledFailure: true,
        emailHookFailure: true,
      }),
    ).toEqual({
      desktopEnabled: false,
      onlyWhenAway: true,
      hideTaskDetails: true,
      weeklyEngagementEnabled: false,
      emailEnabled: true,
      emailDigestEnabled: false,
      emailScheduledSuccess: true,
      emailScheduledFailure: true,
      emailHookFailure: true,
    });
  });
});
