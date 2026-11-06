"use client";

import { AlertCircle, DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

const TOAST_ID = "void-agent-desktop-update";

function UpdateToast({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border bg-card p-3 shadow-lg ring-1 ring-border/60">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        {children}
      </div>
    </div>
  );
}

export function renderDesktopUpdateToast(
  state: DesktopUpdateState,
  updates: NonNullable<NonNullable<Window["desktop"]>["updates"]>,
) {
  const persistent = {
    id: TOAST_ID,
    position: "bottom-left" as const,
    duration: Number.POSITIVE_INFINITY,
  };
  switch (state.status) {
    case "available":
      toast.custom(
        () => (
          <UpdateToast
            icon={
              <DownloadCloud className="mt-0.5 size-4 shrink-0 text-primary" />
            }
            title="Update available"
            detail={`Void-Agent ${state.version} is downloading in the background.`}
          />
        ),
        persistent,
      );
      return;
    case "downloading":
      toast.custom(
        () => (
          <UpdateToast
            icon={
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            }
            title={`Downloading Void-Agent ${state.version}`}
            detail={`${Math.round(state.percent)}% complete`}
          />
        ),
        persistent,
      );
      return;
    case "downloaded":
      toast.custom(
        () => (
          <UpdateToast
            icon={<RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" />}
            title={`Void-Agent ${state.version} is ready`}
            detail="Restart the desktop app to finish installing the update."
          >
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                data-testid="desktop-update-restart"
                onClick={() => void updates.restartAndInstall()}
              >
                Restart now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => toast.dismiss(TOAST_ID)}
              >
                Later
              </Button>
            </div>
          </UpdateToast>
        ),
        persistent,
      );
      return;
    case "error":
      toast.custom(
        () => (
          <UpdateToast
            icon={
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            }
            title="Update check failed"
            detail={state.message}
          />
        ),
        { id: TOAST_ID, position: "bottom-left", duration: 15_000 },
      );
      return;
    case "idle":
    case "checking":
    case "not-available":
      toast.dismiss(TOAST_ID);
  }
}

export function DesktopUpdateNotifier() {
  useEffect(() => {
    const updates = window.desktop?.updates;
    if (!updates) return;
    const render = (state: DesktopUpdateState) =>
      renderDesktopUpdateToast(state, updates);
    void updates
      .getState()
      .then(render)
      .catch(() => {});
    return updates.onStateChange(render);
  }, []);
  return null;
}
