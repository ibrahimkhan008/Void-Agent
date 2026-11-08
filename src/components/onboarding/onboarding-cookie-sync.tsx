"use client";

import { useEffect } from "react";

/** Backfill the device-local cache only after the server verified completion. */
export function OnboardingCookieSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    void fetch("/api/onboarding/complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {
      // The database remains authoritative; a failed cache write is harmless.
    });
  }, [enabled]);

  return null;
}
