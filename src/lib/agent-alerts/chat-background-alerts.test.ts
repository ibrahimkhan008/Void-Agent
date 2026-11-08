import { describe, expect, it } from "vitest";
import {
  chatBackgroundAlertCopy,
  chatBackgroundAlertHref,
  createChatBackgroundAlertDeduper,
  isChatBackgroundAlertEnabled,
  isChatUserAway,
  isViewingChatThread,
  resolveChatBackgroundAlertPreferences,
  shouldSendChatBackgroundAlert,
  shouldSendChatForegroundAlert,
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

  it("defaults only-when-away off and merges existing user preference values", () => {
    expect(resolveChatBackgroundAlertPreferences(undefined)).toEqual({
      enabled: false,
      onlyWhenAway: false,
    });
    expect(
      resolveChatBackgroundAlertPreferences({
        backgroundChatAlerts: true,
        chatAlertsOnlyWhenAway: true,
        unrelated: "ignored",
      }),
    ).toEqual({ enabled: true, onlyWhenAway: true });
  });

  it("detects away state and suppresses alerts for the visible current thread", () => {
    expect(isChatUserAway(false, true)).toBe(false);
    expect(isChatUserAway(false, false)).toBe(true);
    expect(isChatUserAway(true, true)).toBe(true);
    expect(isViewingChatThread("thread-1", "/chat/thread-1", false)).toBe(true);
    expect(isViewingChatThread("thread-1", "/chat/thread-1", true)).toBe(false);
    expect(isViewingChatThread("thread-1", "/chat/thread-2", false)).toBe(
      false,
    );
  });

  it("routes opted-in alerts to the foreground only while the tab is visible", () => {
    expect(shouldSendChatForegroundAlert(true, false)).toBe(true);
    expect(shouldSendChatForegroundAlert(true, true)).toBe(false);
    expect(shouldSendChatForegroundAlert(false, false)).toBe(false);
    expect(shouldSendChatForegroundAlert(true, false, true)).toBe(false);
  });

  it("sends only when enabled, hidden, and browser permission is granted", () => {
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        away: true,
        permission: "granted",
      }),
    ).toBe(true);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: false,
        away: true,
        permission: "granted",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        away: false,
        permission: "granted",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        away: true,
        permission: "default",
      }),
    ).toBe(false);
    expect(
      shouldSendChatBackgroundAlert({
        enabled: true,
        away: true,
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

  it("keeps chat alert navigation on the app origin and encodes the thread as one path segment", () => {
    expect(chatBackgroundAlertHref("thread/with spaces")).toBe(
      "/chat/thread%2Fwith%20spaces",
    );
    expect(chatBackgroundAlertHref("//evil.example/path")).toBe(
      "/chat/%2F%2Fevil.example%2Fpath",
    );
  });
});
