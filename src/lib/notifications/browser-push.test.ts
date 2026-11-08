import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeBrowserPush, unsubscribeBrowserPush } from "./browser-push";

const subscription = {
  endpoint: "https://push.example/subscription",
  toJSON: () => ({
    endpoint: "https://push.example/subscription",
    keys: { p256dh: "public-key", auth: "auth-key" },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function installBrowser({
  permission = "granted",
  existingSubscription = null,
}: {
  permission?: NotificationPermission;
  existingSubscription?: typeof subscription | null;
} = {}) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSubscription),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { pushManager };
  const serviceWorker = {
    getRegistration: vi.fn().mockResolvedValue(registration),
    register: vi.fn().mockResolvedValue(registration),
  };
  const requestPermission = vi.fn().mockResolvedValue(permission);
  vi.stubGlobal("window", {
    Notification: { permission, requestPermission },
    PushManager: function PushManager() {},
    atob: (value: string) => atob(value),
  });
  vi.stubGlobal("Notification", {
    permission,
    requestPermission,
  });
  vi.stubGlobal("navigator", { serviceWorker });
  return { pushManager, registration, serviceWorker, requestPermission };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("browser push subscription management", () => {
  it("does not subscribe when browser permission is denied", async () => {
    const browser = installBrowser({ permission: "denied" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(subscribeBrowserPush()).resolves.toEqual({
      ok: false,
      reason: "permission-denied",
    });
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles a dismissed permission prompt without creating a subscription", async () => {
    const browser = installBrowser({ permission: "default" });
    browser.requestPermission.mockResolvedValue("default");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(subscribeBrowserPush()).resolves.toEqual({
      ok: false,
      reason: "permission-dismissed",
    });
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("requests permission, creates and registers a subscription", async () => {
    const browser = installBrowser({ permission: "default" });
    browser.requestPermission.mockResolvedValue("granted");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: "AQID", encryptionAvailable: true }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(subscribeBrowserPush()).resolves.toEqual({ ok: true });
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/push/subscribe");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "public-key", auth: "auth-key" },
    });
  });

  it("unregisters the owner endpoint before unsubscribing the browser", async () => {
    installBrowser({ existingSubscription: subscription });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(unsubscribeBrowserPush()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }),
    );
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps the local subscription when server unregistration fails", async () => {
    installBrowser({ existingSubscription: subscription });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(unsubscribeBrowserPush()).resolves.toEqual({
      ok: false,
      reason: "server-error",
    });
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });
});
