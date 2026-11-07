"use client";

import type { SuperlogSummary } from "lib/cockpit/superlog";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";

type Team = { id: string; name: string; role: "owner" | "editor" | "viewer" };
type Status = {
  connected: boolean;
  tokenSet: boolean;
  canManage: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string | null;
};

export function SuperlogDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [summary, setSummary] = useState<SuperlogSummary | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setStatus(null);
    setSummary(null);
    try {
      const response = await fetch(`/api/cockpit/superlog/connection${query}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load Superlog connection.");
      setStatus(data as Status);
      setToken("");
      if (data.connected) {
        const feed = await fetch(`/api/cockpit/superlog/summary${query}`, {
          cache: "no-store",
        });
        const body = await feed.json();
        if (!feed.ok)
          throw new Error(body.error ?? "Could not load Superlog incidents.");
        setSummary(body as SuperlogSummary);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load Superlog data.",
      );
    } finally {
      setBusy(false);
    }
  }, [query]);

  useEffect(() => {
    void fetch("/api/projects/teams", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok)
          setTeams(((await response.json()) as { teams?: Team[] }).teams ?? []);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/superlog/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, config: { token } }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save the connection.");
      setStatus(data as Status);
      setToken("");
      setNotice("Superlog connection saved.");
      const test = await fetch("/api/cockpit/superlog/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const testData = await test.json();
      if (!test.ok)
        throw new Error(
          testData.error ?? "Connection saved, but testing failed.",
        );
      await load();
      setNotice("Superlog connection saved and tested.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save Superlog connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this Superlog connection?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cockpit/superlog/connection${query}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("Could not remove Superlog connection.");
      await load();
      setNotice("Superlog connection removed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove Superlog connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canManage = !teamId || status?.canManage === true;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cockpit / Superlog</p>
          <h1 className="mt-1 text-3xl font-semibold">Incidents and alerts</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Read-only incident, alert, and error summaries from your Superlog
            account. The token is stored encrypted and never returned to the
            browser.
          </p>
        </div>
        <nav
          aria-label="Cockpit providers"
          className="flex flex-wrap gap-2 text-sm"
        >
          <Link className="rounded-md border px-3 py-2" href="/cockpit/stripe">
            Stripe
          </Link>
          <Link className="rounded-md border px-3 py-2" href="/cockpit/vercel">
            Vercel
          </Link>
          <Link className="rounded-md border px-3 py-2" href="/cockpit/website">
            Website
          </Link>
          <Link className="rounded-md border px-3 py-2" href="/cockpit/revolut">
            Revolut
          </Link>
        </nav>
      </header>
      <label className="grid max-w-sm gap-2 text-sm font-medium">
        Connection scope
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={teamId ?? "personal"}
          onChange={(event) =>
            setTeamId(
              event.target.value === "personal" ? null : event.target.value,
            )
          }
        >
          <option value="personal">Personal</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.role})
            </option>
          ))}
        </select>
      </label>
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use a Superlog personal access token beginning with{" "}
            <code>superlog_pat_</code>. Ingest and management keys cannot
            authenticate to the read-only MCP endpoint.
          </p>
          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Superlog personal access token"
                type="password"
                autoComplete="new-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  status?.tokenSet
                    ? "Saved token is set; leave blank to keep it"
                    : "superlog_pat_…"
                }
              />
              <Button
                disabled={busy || (!token.trim() && !status?.tokenSet)}
                onClick={() => void save()}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  "Save and test"
                )}
              </Button>
            </div>
          )}
          {!canManage && (
            <p className="text-sm text-muted-foreground">
              You can view this team connection. Only team owners and editors
              can change it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{status?.connected ? "Connected" : "Not connected"}</span>
            {status?.lastTestOk === true && (
              <CheckCircle2
                aria-label="Connection test passed"
                className="size-4 text-green-600"
              />
            )}
            {status?.lastTestOk === false && (
              <AlertTriangle
                aria-label="Connection test failed"
                className="size-4 text-destructive"
              />
            )}
            {status?.lastTestedAt && (
              <span className="text-muted-foreground">
                Tested {new Date(status.lastTestedAt).toLocaleString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            {status?.connected && canManage && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 className="mr-2 size-4" />
                Remove
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>
      {summary && (
        <section className="space-y-4" aria-label="Superlog incident summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Open incidents", summary.openIncidents],
              ["Incidents · 24 hours", summary.incidents24h],
              ["Firing alerts", summary.firingAlerts],
              ["Errors · 24 hours", summary.errors24h ?? "Unavailable"],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Open incidents</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.incidents.length ? (
                  <ul className="space-y-3">
                    {summary.incidents.map((incident) => (
                      <li
                        key={incident.id}
                        className="border-b pb-3 last:border-0"
                      >
                        <p className="font-medium">{incident.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {[
                            incident.service,
                            incident.severity,
                            incident.startedAt &&
                              new Date(incident.startedAt).toLocaleString(),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No open incidents.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Services</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.services.length ? (
                  <ul className="space-y-2">
                    {summary.services.map((service) => (
                      <li
                        key={service.name}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="truncate">{service.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {service.openIncidents} incidents ·{" "}
                          {service.errors24h} errors
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No service activity was returned.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </main>
  );
}
