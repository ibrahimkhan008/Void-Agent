/// <reference lib="webworker" />

/** Only allow same-origin, root-relative notification destinations. */
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

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    const parsed = event.data?.json?.();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    // Malformed push payloads must not prevent the worker from handling later
    // notifications. The safe default notification below remains usable.
  }

  const title =
    typeof data.title === "string"
      ? data.title.slice(0, 160)
      : "Void-Agent";
  const body =
    typeof data.body === "string"
      ? data.body.slice(0, 500)
      : "An agent needs your attention.";
  const path = safeNotificationPath(data.href ?? data.url) ?? "/";
  const tag =
    typeof data.tag === "string"
      ? data.tag.slice(0, 128)
      : typeof data.kind === "string"
        ? data.kind.slice(0, 128)
        : "agent-alert";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/favicon.ico",
      data: { href: path },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeNotificationPath(event.notification.data?.href) ?? "/";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existing) {
          return existing.navigate(target).then(() => existing.focus());
        }
        return self.clients.openWindow(target);
      }),
  );
});
