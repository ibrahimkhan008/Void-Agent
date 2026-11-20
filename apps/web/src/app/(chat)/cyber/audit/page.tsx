"use client";

import {
  CyberPageHeader,
  CyberSkeletonTable,
  StatusBadge,
} from "@/components/cyber/cyber-ui";
import { cn } from "lib/utils";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuditEvent = {
  id: string;
  userId: string;
  sessionId: string | null;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  timestamp: string;
};

const SEVERITY_FILTERS = [
  { value: "", label: "All Events" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "breach", label: "Scope Breach" },
];

export default function AuditTrailPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [scopeAll, setScopeAll] = useState(true);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setForbidden(false);

      const params = new URLSearchParams({ limit: "100" });
      if (!scopeAll) params.set("scope", "self");
      if (severity) params.set("severity", severity);

      try {
        const res = await fetch(`/api/cyber/audit?${params}`);
        if (res.status === 403 || res.status === 401) {
          setForbidden(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load audit log");
          return;
        }
        setEvents(data.events ?? []);
      } catch {
        setError("Network error while loading audit events");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scopeAll, severity],
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.eventType.toLowerCase().includes(q) ||
        JSON.stringify(e.details).toLowerCase().includes(q),
    );
  }, [events, search]);

  const breachCount = events.filter((e) => e.severity === "breach").length;

  if (!loading && forbidden) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center">
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 mb-4">
          <Lock className="size-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-lg font-semibold text-foreground mb-1.5">
          Administrator Access Required
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          The Void Cyber Security Audit Trail is restricted strictly to platform
          administrators.
        </p>
        <Link
          href="/cyber/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
        >
          Back to Cyber Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Security Audit Trail"
        description="Admin-only immutable behavioral log of scope evaluations, blocked out-of-scope attempts, agent commands, verifications, and governance actions."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScopeAll((v) => !v)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                scopeAll
                  ? "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {scopeAll ? "All Organization Events" : "My Events Only"}
            </button>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
              Refresh
            </button>
          </div>
        }
      />

      {breachCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            <strong>{breachCount}</strong> out-of-scope attempt
            {breachCount === 1 ? "" : "s"} deterministically blocked and logged
            in this view.
          </span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border self-start">
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setSeverity(f.value)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                severity === f.value
                  ? "bg-background text-foreground shadow-xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by event or target…"
            aria-label="Filter audit events"
            className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          />
        </div>
      </div>

      {loading && <CyberSkeletonTable rows={6} />}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Activity className="size-8 text-muted-foreground mx-auto mb-3 opacity-70" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No matching audit events
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Scope checks, agent commands, finding verifications, and report
            exports are automatically recorded here.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {filtered.map((event) => {
            const isOpen = expandedId === event.id;
            return (
              <div key={event.id} className="transition-colors">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : event.id)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/50 transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <StatusBadge status={event.severity} />
                  <code className="text-xs font-mono font-medium text-foreground">
                    {event.eventType}
                  </code>
                  <span className="text-xs text-muted-foreground truncate flex-1 hidden md:inline">
                    {Object.entries(event.details ?? {})
                      .slice(0, 3)
                      .map(
                        ([k, v]) =>
                          `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`,
                      )
                      .join(" · ")}
                  </span>
                  <time className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto">
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                </button>
                {isOpen && (
                  <div className="px-10 pb-4 pt-1 bg-muted/20">
                    <pre className="text-xs font-mono text-foreground bg-background border border-border rounded-lg p-3 overflow-x-auto">
                      {JSON.stringify(
                        {
                          id: event.id,
                          userId: event.userId,
                          sessionId: event.sessionId,
                          ...event.details,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
