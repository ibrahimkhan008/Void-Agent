"use client";

import type { MarketingSummary } from "lib/cockpit/website-metrics/types";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Input } from "ui/input";
import { WebsiteAnalyticsPanels } from "./website-analytics-panels";

type Status = {
  connected: boolean;
  config: { supabaseUrl: string; rangeDays: number; secretSet: true } | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  canManage: boolean;
};
type TeamChoice = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};

const number = new Intl.NumberFormat();
const rate = (value: number) => `${(value * 100).toFixed(1)}%`;

export function WebsiteDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [rangeDays, setRangeDays] = useState(30);
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const response = await fetch(`/api/cockpit/website/connection${query}`, {
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Could not load connection status.");
      const next = value as Status;
      setStatus(next);
      if (next.config) {
        setUrl(next.config.supabaseUrl);
        setRangeDays(next.config.rangeDays);
      }
      if (next.connected) {
        const data = await fetch(`/api/cockpit/website/summary${query}`, {
          cache: "no-store",
        });
        const body = await data.json();
        if (!data.ok)
          throw new Error(body.error ?? "Could not load website analytics.");
        setSummary(body as MarketingSummary);
      } else setSummary(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load website analytics.",
      );
    } finally {
      setBusy(null);
    }
  }, [query]);

  useEffect(() => {
    let active = true;
    void fetch("/api/projects/teams", { cache: "no-store" })
      .then(async (r) =>
        r.ok
          ? (((await r.json()) as { teams?: TeamChoice[] }).teams ?? [])
          : [],
      )
      .then((value) => {
        if (active) setTeams(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/website/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          config: {
            supabaseUrl: url,
            supabaseSecretKey: secret || undefined,
            rangeDays,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save connection.");
      setStatus(body as Status);
      setSecret("");
      setNotice("Encrypted connection saved. Test it to confirm read access.");
      setSummary(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save connection.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/website/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = await response.json();
      await load();
      if (!response.ok || !body.ok)
        throw new Error(body.error ?? "Supabase rejected the connection.");
      setNotice("Website analytics connection verified.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Connection test failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const response = await fetch(`/api/cockpit/website/connection${query}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not remove connection.");
      setStatus(null);
      setSummary(null);
      setUrl("");
      setSecret("");
      setNotice("Website connection removed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove connection.",
      );
    } finally {
      setBusy(null);
    }
  }

  const loading = busy !== null;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-muted-foreground">
            Cockpit / Website
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Website analytics
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            First-party visits, campaign attribution, and lead activity from
            your Supabase site_events table.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/cockpit/stripe">Stripe overview</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/vercel">Vercel deployments</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/revolut">Revolut Business</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/superlog">Superlog incidents</Link>
          </Button>
          {status?.connected && (
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="website-scope" className="text-sm font-medium">
          Connection scope
        </label>
        <select
          id="website-scope"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={teamId ?? "personal"}
          onChange={(event) => {
            setTeamId(
              event.target.value === "personal" ? null : event.target.value,
            );
            setSummary(null);
            setError(null);
          }}
        >
          <option value="personal">Personal</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
              {team.role === "viewer" ? " · view only" : ""}
            </option>
          ))}
        </select>
        {teamId && status && !status.canManage && (
          <span className="text-sm text-muted-foreground">
            Team members can view; owners and editors manage this connection.
          </span>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
        >
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Supabase connection</CardTitle>
          <CardDescription>
            Use a service role or secret key with read-only SELECT access to
            site_events. Credentials are encrypted at rest and never returned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>
                {status.lastTestedAt
                  ? status.lastTestOk
                    ? "Connection verified"
                    : "Last connection test failed"
                  : "Connection has not been tested"}{" "}
                · key stored
              </span>
              {status.canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void test()}
                  >
                    Test connection
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={loading}
                    onClick={() => void remove()}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No website analytics source is connected.
            </p>
          )}
          {(!teamId || status?.canManage) && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="Supabase project URL"
                  placeholder="https://project-ref.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  maxLength={500}
                />
                <Input
                  aria-label="Supabase secret key"
                  autoComplete="new-password"
                  type="password"
                  placeholder={
                    status?.connected
                      ? "Leave blank to keep current key"
                      : "Supabase secret key"
                  }
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  maxLength={10_000}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="website-range" className="text-sm">
                  Report range
                </label>
                <select
                  id="website-range"
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {[7, 14, 30, 60, 90].map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </select>
                <Button
                  disabled={loading || !url || (!secret && !status?.connected)}
                  onClick={() => void save()}
                >
                  {busy === "save" && (
                    <LoaderCircle className="size-4 animate-spin" />
                  )}
                  {status?.connected ? "Save changes" : "Connect website"}
                </Button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            For SSRF protection, only hosted Supabase project URLs ending in
            supabase.co are accepted. Analytics queries are read-only,
            time-bounded, and capped.
          </p>
        </CardContent>
      </Card>
      {busy === "load" && (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading website analytics…
        </div>
      )}
      {summary && (
        <section className="space-y-4" aria-label="Website analytics summary">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Visits", number.format(summary.visits)],
              ["Visitors", number.format(summary.visitors)],
              ["Pageviews", number.format(summary.pageviews)],
              ["Leads", number.format(summary.leads)],
              ["Conversion rate", rate(summary.conversionRate)],
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
            {[
              [
                "Channels",
                summary.channels.map((item) => [
                  item.channel,
                  `${number.format(item.visits)} visits · ${number.format(item.leads)} leads`,
                ]),
              ],
              [
                "Top pages",
                summary.topPages.map((item) => [
                  item.path,
                  `${number.format(item.pageviews)} pageviews`,
                ]),
              ],
              [
                "Campaigns",
                summary.topCampaigns.map((item) => [
                  item.campaign,
                  `${number.format(item.visits)} visits · ${number.format(item.leads)} leads`,
                ]),
              ],
              [
                "Recent leads",
                summary.recentLeads.map((item) => [
                  `${new Date(item.at).toLocaleString()} · ${item.form ?? "Lead"}`,
                  `${item.channel} / ${item.source}`,
                ]),
              ],
            ].map(([heading, rows]) => (
              <Card key={heading as string}>
                <CardHeader>
                  <CardTitle>{heading as string}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(rows as string[][]).length ? (
                    <ul className="space-y-2">
                      {(rows as string[][]).map(([label, value], index) => (
                        <li
                          key={`${label}-${index}`}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span className="truncate">{label}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No activity in this range.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <WebsiteAnalyticsPanels summary={summary} />
          <p className="text-xs text-muted-foreground">
            Previous period: {number.format(summary.previous.visits)} visits and{" "}
            {number.format(summary.previous.leads)} leads. Updated{" "}
            {new Date().toLocaleString()}.
          </p>
        </section>
      )}
    </main>
  );
}
