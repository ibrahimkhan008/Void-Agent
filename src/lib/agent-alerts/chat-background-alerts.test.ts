import { describe, expect, it } from "vitest";
import {
  chatBackgroundAlertCopy,
  createChatBackgroundAlertDeduper,
  isChatBackgroundAlertEnabled,
  shouldSendChatBackgroundAlert,
} from "./chat-background-alerts";

describe("background chat alert preferences", () => {
  it("keeps alerts opt-in and rejects non-boolean values", () => {
    expect(isChatBackgroundAlertEnabled(undefined)).toBe(false);
    expect(isChatBackgroundAlertEnabled({})).toBe(false);
    expect(isChatBackgroundAlertEnabled({ backgroundChatAlerts: 1 })).toBe(
      false,
    );
    expect(isChatBackgroundAlertEnabled({ backgroundChatAlerts: true })).toBe(
      true,
    );
  });

  it("sends only when enabled, hidden, and browser permission is granted", () => {
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        hidden: true,
        permission: "granted",
      }),
    ).toBe(true);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: false,
        hidden: true,
        permission: "granted",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        hidden: false,
        permission: "granted",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        hidden: true,
        permission: "default",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        hidden: true,
        permission: "unsupported",
      }),
    ).toBe(false);
  });
});

describe("background chat alert deduplication and copy", () => {
  it("claims an event once but allows later events and kinds", () => {
    const deduper = createChatBackgroundAlertDeduper();
    const alert = {
      kind: "complete" as const,
      threadId: "thread-1",
      eventId: "message-1",
    };
    expect(deduper.claim(alert)).toBe(true);
    expect(deduper.claim(alert)).toBe(false);
    expect(deduper.claim({ ...alert, eventId: "message-2" })).toBe(true);
    expect(deduper.claim({ ...alert, kind: "error" })).toBe(true);
  });

  it("uses generic notification copy without conversation details", () => {
    expect(chatBackgroundAlertCopy("needs_approval")).toEqual({
      title: "Void-Agent needs your approval",
      body: "A chat is waiting for your review.",
    });
    expect(chatBackgroundAlertCopy("needs_input").body).not.toContain("thread");
  });
});
