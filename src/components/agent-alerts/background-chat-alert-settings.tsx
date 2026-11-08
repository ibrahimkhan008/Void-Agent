"use client";

import type { UserPreferences } from "app-types/user";
import { fetcher } from "lib/utils";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Switch } from "ui/switch";

export function BackgroundChatAlertSettings() {
  const { data, isLoading, mutate } = useSWR<UserPreferences>(
    "/api/user/preferences",
    fetcher,
  );
  const [isSaving, setIsSaving] = useState(false);
  const enabled = data?.notifications?.backgroundChatAlerts === true;
  const onlyWhenAway = data?.notifications?.chatAlertsOnlyWhenAway === true;
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const update = useCallback(
    async (nextEnabled: boolean) => {
      setIsSaving(true);
      try {
        const next: UserPreferences = {
          ...(data ?? {}),
          notifications: {
            ...(data?.notifications ?? {}),
            backgroundChatAlerts: nextEnabled,
          },
        };
        const response = await fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("Failed to save preferences");
        await mutate(next, false);
      } catch {
        toast.error("Could not save background alert preference.");
      } finally {
        setIsSaving(false);
      }
    },
    [data, mutate],
  );

  const updateOnlyWhenAway = useCallback(
    async (nextOnlyWhenAway: boolean) => {
      setIsSaving(true);
      try {
        const next: UserPreferences = {
          ...(data ?? {}),
          notifications: {
            ...(data?.notifications ?? {}),
            chatAlertsOnlyWhenAway: nextOnlyWhenAway,
          },
        };
        const response = await fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("Failed to save preferences");
        await mutate(next, false);
      } catch {
        toast.error("Could not save background alert preference.");
      } finally {
        setIsSaving(false);
      }
    },
    [data, mutate],
  );

  const handleChange = async (nextEnabled: boolean) => {
    if (!nextEnabled) {
      await update(false);
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("This browser does not support notifications.");
      return;
    }

    // The permission request happens only inside this explicit switch gesture.
    const nextPermission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    setPermission(nextPermission);
    if (nextPermission !== "granted") {
      toast.error(
        nextPermission === "denied"
          ? "Notifications are blocked in browser settings."
          : "Notification permission was not granted.",
      );
      return;
    }
    await update(true);
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h3 className="text-xl font-semibold">Chat alerts</h3>
        <p className="py-2 text-sm text-muted-foreground">
          Get an in-app alert while this tab is open, or a browser notification
          when it is hidden, when a response finishes, errors, or waits for your
          approval or input. Alert text never includes your prompt or response.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="background-chat-alerts">Enable chat alerts</Label>
              <p className="text-xs text-muted-foreground">
                Browser permission: {permission}
              </p>
            </div>
            <Switch
              id="background-chat-alerts"
              checked={enabled}
              disabled={isSaving || permission === "unsupported"}
              onCheckedChange={(checked) => void handleChange(checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="chat-alerts-only-away">Only when away</Label>
              <p className="text-xs text-muted-foreground">
                Send alerts only when this tab is hidden or not focused. Alerts
                for the chat you are viewing are always suppressed.
              </p>
            </div>
            <Switch
              id="chat-alerts-only-away"
              checked={onlyWhenAway}
              disabled={isSaving || !enabled}
              onCheckedChange={(checked) => void updateOnlyWhenAway(checked)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
