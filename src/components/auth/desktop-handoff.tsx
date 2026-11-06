"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function DesktopHandoff({ deepLink }: { deepLink: string }) {
  useEffect(() => { window.location.assign(deepLink); }, [deepLink]);
  return <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 className="text-2xl font-semibold">Return to Void-Agent</h1>
    <p className="text-muted-foreground">Your browser sign-in is complete. Continue to the desktop app to finish signing in.</p>
    <Button asChild><a href={deepLink}>Open Void-Agent</a></Button>
    <p className="text-xs text-muted-foreground">This one-time sign-in link expires shortly and can only be used once.</p>
  </main>;
}

export function DesktopHandoffInvalid() {
  return <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
    <h1 className="text-2xl font-semibold">Desktop sign-in unavailable</h1>
    <p className="text-muted-foreground">Sign in to Void-Agent in your browser first, then reopen the desktop handoff link.</p>
  </main>;
}
