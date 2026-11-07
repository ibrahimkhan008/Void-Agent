"use client";

import { useState } from "react";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";

type AuditEvent = {
  timestamp: string;
  action: "mcp.list-tools" | "mcp.tool-call";
  configHash: string;
  toolName?: string;
  argsHash?: string;
  outcome: "success" | "denied" | "failure";
};

export function McpAuditHistory() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!window.desktop?.mcp) return;
    setLoading(true);
    setError(null);
    try {
      setEvents(await window.desktop.mcp.getRecentAuditEvents());
    } catch {
      setError("Could not read local MCP activity. Reopen this screen and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          void loadHistory();
        }}
      >
        Local MCP activity
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Local MCP activity</DialogTitle>
            <DialogDescription>
              Recent desktop tool access decisions. Arguments and tool results are never stored here.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">Loading activity…</p>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No local MCP activity recorded yet.</p>
          ) : (
            <ol className="space-y-3" aria-label="Recent local MCP events">
              {events.map((event, index) => (
                <li key={`${event.timestamp}-${event.action}-${index}`} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{event.action === "mcp.list-tools" ? "Listed tools" : `Called ${event.toolName ?? "tool"}`}</strong>
                    <span className={event.outcome === "success" ? "text-emerald-600" : "text-amber-600"}>
                      {event.outcome}
                    </span>
                  </div>
                  <time className="mt-1 block text-xs text-muted-foreground" dateTime={event.timestamp}>
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Config fingerprint: {event.configHash.slice(0, 12)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
