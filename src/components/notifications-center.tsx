"use client";

import { Bell, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsCenter({
  compact = false,
}: { compact?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/notifications?limit=30", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.notifications ?? []);
    setUnread(data.unreadCount ?? 0);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, []);

  const enablePush = async () => {
    setBusy(true);
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error("Browser push is not supported.");
      const config = await fetch("/api/push/subscribe", {
        cache: "no-store",
      }).then((r) => r.json());
      if (!config.publicKey)
        throw new Error(
          "Push notifications are not configured on this server.",
        );
      if (!config.encryptionAvailable)
        throw new Error("Server-side push encryption is not configured.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(config.publicKey) as BufferSource,
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("Could not register this device.");
      setPushEnabled(true);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not enable notifications.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushEnabled(false);
        return;
      }
      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok)
        throw new Error("Could not disable browser notifications.");
      await subscription.unsubscribe();
      setPushEnabled(false);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not disable browser notifications.",
      );
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (ids?: string[]) => {
    const response = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    if (response.ok) await refresh();
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Could not send a test notification.");
      }
      await refresh();
      window.alert("Test notification sent.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not send a test notification.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (compact)
    return (
      <Link
        href="/notifications"
        aria-label={`Notifications, ${unread} unread`}
        className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
        )}
      </Link>
    );

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={pushEnabled ? disablePush : enablePush}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {pushEnabled
              ? "Disable browser notifications"
              : "Enable browser notifications"}
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={busy}>
            <Bell className="mr-2 size-4" />
            Send test
          </Button>
          <Button
            variant="outline"
            onClick={() => markRead()}
            disabled={!unread}
          >
            <Check className="mr-2 size-4" />
            Mark all read
          </Button>
        </div>
      </div>
      <div className="divide-y rounded-lg border">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="flex items-start gap-3 p-4">
              <div
                className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt ? "bg-muted" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{item.title}</h2>
                <p className="text-sm text-muted-foreground">{item.body}</p>
                <time className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                {item.href && (
                  <div>
                    <Link
                      className="text-sm underline"
                      href={item.href}
                      onClick={() => {
                        if (!item.readAt) void markRead([item.id]);
                      }}
                    >
                      Open
                    </Link>
                  </div>
                )}
              </div>
              {!item.readAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markRead([item.id])}
                >
                  Mark read
                </Button>
              )}
            </article>
          ))
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            You’re all caught up.
          </p>
        )}
      </div>
    </main>
  );
}

function decodeKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
