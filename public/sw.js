/// <reference lib="webworker" />

const CACHE_NAME = "flare-cache-v1";

function safeNotificationPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  let decoded = value;
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (
      /[\\\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.startsWith("//")
    ) {
      return null;
    }
  }

  try {
    return new URL(value, self.location.origin).origin === self.location.origin
      ? value
      : null;
  } catch {
    return null;
  }
}

// Install event
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    payload = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 160) : "Void-Agent";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 500) : "You have a new notification.";
  const href = safeNotificationPath(payload.href) ?? "/";
  event.waitUntil(self.registration.showNotification(title, { body, data: { href }, icon: "/favicon.ico" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeNotificationPath(event.notification.data?.href) ?? "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return self.clients.openWindow(target);
  }));
});
