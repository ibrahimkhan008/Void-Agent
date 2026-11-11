"use client";

import { useEffect, useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";

export function SecurityEventsSettings() {
  const [lookback, setLookback] = useState("50");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/security-settings", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load settings");
        if (active) setLookback(String(result.securityEventsLookback));
      })
      .catch((error: unknown) => {
        if (active)
          setStatus(
            error instanceof Error ? error.message : "Could not load settings",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    const value = Number(lookback);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setStatus("Enter a whole number from 1 to 500.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/security-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityEventsLookback: value }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not save settings");
      setStatus("Security-event history setting saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save settings",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Sign-in security events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Compare a sign-in with this many recent events for that same account
          when identifying a new device or country. Event records retain only a
          validated client IP, bounded user agent, and the referring origin.
        </p>
        <div className="flex max-w-sm items-center gap-3">
          <Input
            aria-label="Recent events to compare"
            type="number"
            min={1}
            max={500}
            step={1}
            value={lookback}
            onChange={(event) => setLookback(event.target.value)}
          />
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {status}
        </p>
      </CardContent>
    </Card>
  );
}
