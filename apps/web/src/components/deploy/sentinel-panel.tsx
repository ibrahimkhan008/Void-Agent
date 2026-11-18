"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Void Sentinel panel (master prompt §3.10): attach autonomous monitors to
 * published sites, pick the autonomy mode, and drive the incident lifecycle
 * — approve prepared fixes, roll back, close.
 */

type SentinelMode = "monitor" | "suggest" | "repair_approval" | "autonomous";

interface SentinelMonitor {
  id: string;
  slug: string;
  mode: SentinelMode;
  enabled: boolean;
  assertions: Array<{ type: string; value: string }>;
  intervalSeconds: number;
  lastStatus: "healthy" | "broken" | "unknown";
  lastCheckedAt: string | null;
}

interface SentinelIncident {
  id: string;
  slug: string;
  status: string;
  failureSignature: string;
  diagnosis: string | null;
  fixSummary: string | null;
  deployedVersion: number | null;
  verification: Array<{
    type: string;
    passed: boolean;
    detail?: string;
  }> | null;
  detectedAt: string;
}

const MODE_LABELS: Record<SentinelMode, string> = {
  monitor: "Monitor only",
  suggest: "Suggest fixes",
  repair_approval: "Repair with approval",
  autonomous: "Autonomous within limits",
};

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  healthy: {
    label: "Healthy",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  broken: {
    label: "Broken",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  unknown: {
    label: "Not probed yet",
    className: "bg-muted text-muted-foreground",
  },
};

const INCIDENT_PILL: Record<string, { label: string; className: string }> = {
  open: {
    label: "Detected",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  diagnosed: {
    label: "Diagnosed",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  fix_proposed: {
    label: "Fix awaiting approval",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  fix_deployed: {
    label: "Fix deployed — confirming",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  resolved: {
    label: "Resolved",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  rolled_back: {
    label: "Rolled back",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

export function SentinelPanel({
  sites,
}: { sites: Array<{ slug: string; title: string }> }) {
  const [monitors, setMonitors] = useState<SentinelMonitor[]>([]);
  const [incidents, setIncidents] = useState<SentinelIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    mode: SentinelMode;
    intervalSeconds: number;
    assertionsText: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/sentinel/monitors");
    if (response.ok) {
      const payload = await response.json();
      setMonitors(payload.monitors ?? []);
      setIncidents(payload.incidents ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monitorBySlug = useMemo(() => {
    const map = new Map<string, SentinelMonitor>();
    for (const monitor of monitors) map.set(monitor.slug, monitor);
    return map;
  }, [monitors]);

  const openIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) =>
          incident.status !== "resolved" && incident.status !== "closed",
      ),
    [incidents],
  );

  function parseAssertions(text: string) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        const type = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        return { type, value };
      })
      .filter(
        (
          item,
        ): item is {
          type: "contains" | "not_contains" | "status";
          value: string;
        } =>
          (item.type === "contains" ||
            item.type === "not_contains" ||
            item.type === "status") &&
          item.value.length > 0,
      );
  }

  function openSite(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      setDraft(null);
      return;
    }
    const monitor = monitorBySlug.get(slug);
    setExpanded(slug);
    setError(null);
    setDraft({
      mode: monitor?.mode ?? "monitor",
      intervalSeconds: monitor?.intervalSeconds ?? 300,
      assertionsText:
        monitor?.assertions
          .map((item) => `${item.type}: ${item.value}`)
          .join("\n") ?? "",
    });
  }

  async function saveFor(slug: string, enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const existing = monitorBySlug.get(slug);
      const body = {
        slug,
        mode: draft?.mode ?? existing?.mode ?? "monitor",
        intervalSeconds:
          draft?.intervalSeconds ?? existing?.intervalSeconds ?? 300,
        assertions: parseAssertions(draft?.assertionsText ?? ""),
        ...(existing ? {} : {}),
      };
      const response = existing
        ? await fetch(`/api/sentinel/monitors/${existing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: body.mode,
              intervalSeconds: body.intervalSeconds,
              assertions: body.assertions,
              enabled,
            }),
          })
        : await fetch("/api/sentinel/monitors", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, enabled }),
          });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Could not save the Sentinel settings");
        return;
      }
      const monitor = (payload?.monitor ?? payload) as SentinelMonitor;
      setMonitors((current) => [
        ...current.filter((item) => item.slug !== slug),
        monitor,
      ]);
    } finally {
      setSaving(false);
    }
  }

  async function incidentAction(
    incidentId: string,
    action: "approve" | "rollback" | "close",
  ) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/sentinel/incidents/${incidentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleMonitor(slug: string, enabled: boolean) {
    const existing = monitorBySlug.get(slug);
    if (!existing) {
      // Enabling from scratch: open the editor with defaults prefilled.
      setExpanded(slug);
      setDraft({
        mode: "suggest",
        intervalSeconds: 300,
        assertionsText: "",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/sentinel/monitors/${existing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        const payload = await response.json();
        setMonitors((current) =>
          current.map((item) =>
            item.slug === slug
              ? ((payload?.monitor ?? item) as SentinelMonitor)
              : item,
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Void Sentinel — autonomous monitoring & repair
          </Label>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Sentinel probes your published sites, opens incidents when they break,
        and — depending on the mode — diagnoses, repairs, verifies and redeploys
        them. Rollback is one click.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading Sentinel…</p>
      ) : null}

      {!loading && openIncidents.length > 0 ? (
        <div className="mt-4 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Open incidents
          </Label>
          {openIncidents.map((incident) => {
            const pill = INCIDENT_PILL[incident.status] ?? {
              label: incident.status,
              className: "bg-muted text-muted-foreground",
            };
            return (
              <div key={incident.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{incident.slug}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${pill.className}`}
                  >
                    {pill.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {incident.failureSignature}
                </p>
                {incident.diagnosis ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs">
                    {incident.diagnosis.slice(0, 600)}
                  </p>
                ) : null}
                {incident.verification ? (
                  <ul className="mt-1 space-y-0.5">
                    {incident.verification.map((check, index) => (
                      <li key={index} className="text-xs">
                        {check.passed ? "✅" : "❌"}{" "}
                        {check.detail ?? check.type}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex gap-2">
                  {incident.status === "fix_proposed" ? (
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        void incidentAction(incident.id, "approve")
                      }
                    >
                      Approve & deploy fix
                    </Button>
                  ) : null}
                  {incident.status === "fix_deployed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void incidentAction(incident.id, "rollback")
                      }
                    >
                      Roll back
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => void incidentAction(incident.id, "close")}
                  >
                    Close incident
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 divide-y">
        {sites.map((site) => {
          const monitor = monitorBySlug.get(site.slug);
          const isOpen = expanded === site.slug;
          const pill = STATUS_PILL[monitor?.lastStatus ?? "unknown"];
          return (
            <div key={site.slug} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => openSite(site.slug)}
                >
                  {monitor?.lastStatus === "broken" ? (
                    <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                  ) : monitor?.enabled ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <ShieldX className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {site.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {monitor
                        ? `${pill.label}${
                            monitor.enabled
                              ? ` · ${MODE_LABELS[monitor.mode]}`
                              : " · disabled"
                          }`
                        : "No Sentinel attached"}
                    </span>
                  </span>
                </button>
                <Switch
                  checked={monitor?.enabled ?? false}
                  onCheckedChange={(checked) =>
                    void toggleMonitor(site.slug, checked)
                  }
                />
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>

              {isOpen && draft ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">Autonomy mode</Label>
                    <Select
                      value={draft.mode}
                      onValueChange={(value) =>
                        setDraft({ ...draft, mode: value as SentinelMode })
                      }
                    >
                      <SelectTrigger className="w-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monitor">Monitor only</SelectItem>
                        <SelectItem value="suggest">Suggest fixes</SelectItem>
                        <SelectItem value="repair_approval">
                          Repair with approval
                        </SelectItem>
                        <SelectItem value="autonomous">
                          Autonomous within limits
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">
                      Probe interval
                    </Label>
                    <Select
                      value={String(draft.intervalSeconds)}
                      onValueChange={(value) =>
                        setDraft({ ...draft, intervalSeconds: Number(value) })
                      }
                    >
                      <SelectTrigger className="w-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">Every minute</SelectItem>
                        <SelectItem value="300">Every 5 minutes</SelectItem>
                        <SelectItem value="900">Every 15 minutes</SelectItem>
                        <SelectItem value="3600">Every hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      Content assertions (one per line: <code>contains: …</code>
                      , <code>not_contains: …</code>)
                    </Label>
                    <Textarea
                      rows={3}
                      placeholder={
                        "contains: Inventory Report\nnot_contains: Error"
                      }
                      value={draft.assertionsText}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          assertionsText: event.target.value,
                        })
                      }
                    />
                  </div>
                  {error ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    disabled={saving}
                    onClick={() =>
                      void saveFor(site.slug, monitor?.enabled ?? true)
                    }
                  >
                    {saving
                      ? "Saving…"
                      : monitor
                        ? "Save Sentinel settings"
                        : "Attach Sentinel"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!sites.length ? (
          <p className="py-3 text-sm text-muted-foreground">
            Publish a site first — Sentinels attach to published pages.
          </p>
        ) : null}
      </div>
    </div>
  );
}
