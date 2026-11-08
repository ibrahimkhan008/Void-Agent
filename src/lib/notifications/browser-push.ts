"use client";

type PushConfiguration = {
  publicKey?: unknown;
  encryptionAvailable?: unknown;
};

export type BrowserPushResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported"
        | "permission-denied"
        | "permission-dismissed"
        | "not-configured"
        | "server-error"
        | "subscription-error";
    };

function decodeVapidKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function hasVapidKey(subscription: PushSubscription, expected: Uint8Array) {
  const key = subscription.options.applicationServerKey;
  if (!key) return false;
  const actual = new Uint8Array(key);
  return (
    actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index])
  );
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Request permission and persist the browser subscription for this signed-in user. */
export async function subscribeBrowserPush(): Promise<BrowserPushResult> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return { ok: false, reason: "unsupported" };

  try {
    let permission = Notification.permission;
    if (permission === "denied")
      return { ok: false, reason: "permission-denied" };
    if (permission === "default")
      permission = await Notification.requestPermission();
    if (permission !== "granted")
      return { ok: false, reason: "permission-dismissed" };

    const configResponse = await fetch("/api/push/subscribe", {
      cache: "no-store",
    });
    if (!configResponse.ok) return { ok: false, reason: "server-error" };
    const config = (await configResponse.json()) as PushConfiguration;
    if (
      typeof config.publicKey !== "string" ||
      config.publicKey.length === 0 ||
      config.encryptionAvailable !== true
    )
      return { ok: false, reason: "not-configured" };

    const registration = await getServiceWorkerRegistration();
    const applicationServerKey = decodeVapidKey(config.publicKey);
    const existingSubscription =
      await registration.pushManager.getSubscription();
    const reuseExisting =
      existingSubscription &&
      hasVapidKey(existingSubscription, applicationServerKey);
    if (existingSubscription && !reuseExisting)
      await existingSubscription.unsubscribe();
    const subscription = reuseExisting
      ? existingSubscription
      : await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      await subscription.unsubscribe();
      return { ok: false, reason: "subscription-error" };
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }),
    });
    if (!response.ok) {
      if (!reuseExisting) await subscription.unsubscribe();
      return { ok: false, reason: "server-error" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "subscription-error" };
  }
}

/** Remove the server registration first, then revoke the local browser endpoint. */
export async function unsubscribeBrowserPush(): Promise<BrowserPushResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator))
    return { ok: false, reason: "unsupported" };

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    const response = await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) return { ok: false, reason: "server-error" };
    await subscription.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, reason: "subscription-error" };
  }
}
