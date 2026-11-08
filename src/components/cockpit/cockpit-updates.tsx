"use client";

import { safeNotificationHref } from "lib/notifications/contracts";
import { Bell, CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useState } from "react";

import {
  COCKPIT_UPDATE_TYPES,
  type CockpitUpdateSeverity,
  parseCockpitUpdateSeverity,
} from "lib/cockpit/updates";

type CockpitUpdate = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type FeedResponse = {
  notifications?: unknown;
};

const severityStyle: Record<CockpitUpdateSeverity, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  alert: "bg-red-500",
};

function isCockpitUpdate(value: unknown): value is CockpitUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    parseCockpitUpdateSeverity(row.type) !== null &&
    typeof row.title === "string" &&
    (typeof row.body === "string" || row.body === null) &&
    (typeof row.href === "string" || row.href === null) &&
    (typeof row.readAt === "string" || row.readAt === null) &&
    typeof row.createdAt === "string" &&
    Number.isFinite(Date.parse(row.createdAt))
  );
}

export function CockpitUpdates() {
  const [updates, setUpdates] = useState<CockpitUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        type: COCKPIT_UPDATE_TYPES.join(","),
        limit: "8",
      });
      const response = await fetch(`/api/notifications?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load cockpit updates");
      const payload = (await response.json()) as FeedResponse;
      const rows = Array.isArray(payload.notifications)
        ? payload.notifications.filter(isCockpitUpdate).slice(0, 8)
        : [];
      setUpdates(rows);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      if (!active) return;
      await refresh();
      if (active) timer = window.setTimeout(() => void poll(), 5_000);
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refresh]);

  const markRead = async (id: string) => {
    const prior = updates;
    setUpdates((current) =>
      current.map((update) =>
        update.id === id && !update.readAt
          ? { ...update, readAt: new Date().toISOString() }
          : update,
      ),
    );
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error("Could not mark update as read");
    } catch {
      setUpdates(prior);
    }
  };

  return (
    <section aria-label="Cockpit updates" className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Bell aria-hidden="true" className="size-5" /> Updates
        </h2>
        <p className="text-sm text-muted-foreground">
          Recent alerts posted by your agents and connected services.
        </p>
      </div>

      {unavailable ? (
        <p
          role="status"
          className="rounded-md border p-3 text-sm text-muted-foreground"
        >
          Updates could not be loaded. Your notification inbox is still
          available.
        </p>
      ) : loading ? (
        <p
          role="status"
          className="rounded-md border p-3 text-sm text-muted-foreground"
        >
          Loading updates...
        </p>
      ) : updates.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          No agent updates yet.
        </p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {updates.map((update) => {
            const severity = parseCockpitUpdateSeverity(update.type) ?? "info";
            const href = safeNotificationHref(update.href);
            return (
              <li
                key={update.id}
                className="flex items-start gap-3 p-3"
                data-read={Boolean(update.readAt)}
              >
                <span
                  aria-label={`${severity} severity`}
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${severityStyle[severity]}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-medium">{update.title}</h3>
                    <time
                      dateTime={update.createdAt}
                      className="text-xs text-muted-foreground"
                    >
                      {new Date(update.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {update.body && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {update.body}
                    </p>
                  )}
                  <div className="mt-2 flex gap-3 text-sm">
                    {href && (
                      <Link
                        href={href}
                        className="underline underline-offset-4"
                        onClick={() => {
                          if (!update.readAt) void markRead(update.id);
                        }}
                      >
                        Open
                      </Link>
                    )}
                    {!update.readAt && (
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => void markRead(update.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
                {update.readAt ? (
                  <CircleCheck
                    aria-label="Read"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : severity === "alert" ? (
                  <CircleAlert
                    aria-label="Unread alert"
                    className="size-4 shrink-0 text-red-600"
                  />
                ) : (
                  <CircleHelp
                    aria-label="Unread update"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
