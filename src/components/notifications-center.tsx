"use client";

import {
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "lib/notifications/browser-push";
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
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
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
    setPushPermission(
      "Notification" in window ? Notification.permission : "unsupported",
    );
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
      const result = await subscribeBrowserPush();
      if (result.ok) {
        setPushEnabled(true);
        setPushPermission("granted");
        return;
      }
      if (result.reason === "permission-denied") setPushPermission("denied");
      const messages = {
        unsupported: "Browser push is not supported on this device.",
        "permission-denied":
          "Notifications are blocked in browser settings. Allow them for this site, then try again.",
        "permission-dismissed": "Notification permission was not granted.",
        "not-configured":
          "Push notifications are not configured on this server.",
        "server-error": "Could not register this device with the server.",
        "subscription-error": "Could not create a browser subscription.",
      };
      throw new Error(messages[result.reason]);
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
      const result = await unsubscribeBrowserPush();
      if (!result.ok)
        throw new Error("Could not disable browser notifications.");
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
      body: JSON.stringify(ids ? { ids } : { all: true }),
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
      {pushPermission === "denied" && (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          Browser notifications are blocked. Allow them in this site’s browser
          settings before enabling push.
        </p>
      )}
      {pushPermission === "unsupported" && (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          This browser does not support push notifications.
        </p>
      )}
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
