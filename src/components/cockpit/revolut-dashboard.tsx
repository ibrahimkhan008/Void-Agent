"use client";

import type { RevolutSummary } from "lib/cockpit/revolut";
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

type Status = {
  connected: boolean;
  config: {
    clientId: string;
    sandbox: boolean;
    issuer: string;
    largeTransactionThreshold: number;
    privateKeySet: boolean;
    refreshTokenSet: boolean;
  } | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string | null;
  canManage: boolean;
};
type TeamChoice = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${number.format(amount)} ${currency}`;
  }
};

export function RevolutDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [summary, setSummary] = useState<RevolutSummary | null>(null);
  const [clientId, setClientId] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [issuer, setIssuer] = useState("");
  const [threshold, setThreshold] = useState(5000);
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const response = await fetch(`/api/cockpit/revolut/connection${query}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load Revolut connection.");
      const next = body as Status;
      setStatus(next);
      if (next.config) {
        setClientId(next.config.clientId);
        setSandbox(next.config.sandbox);
        setIssuer(next.config.issuer);
        setThreshold(next.config.largeTransactionThreshold);
      }
      if (next.connected) {
        const data = await fetch(`/api/cockpit/revolut/summary${query}`, {
          cache: "no-store",
        });
        const summaryBody = await data.json();
        if (!data.ok)
          throw new Error(
            summaryBody.error ?? "Could not load Revolut account data.",
          );
        setSummary(summaryBody as RevolutSummary);
      } else setSummary(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load Revolut data.",
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
      const response = await fetch("/api/cockpit/revolut/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          config: {
            clientId,
            privateKeyPem: privateKeyPem || undefined,
            authorizationCode: authorizationCode || undefined,
            sandbox,
            issuer,
            largeTransactionThreshold: threshold,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save Revolut connection.");
      setStatus(body as Status);
      setPrivateKeyPem("");
      setAuthorizationCode("");
      setSummary(null);
      setNotice(
        "Encrypted Revolut connection saved. Test it to confirm account read access.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save Revolut connection.",
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
      const response = await fetch("/api/cockpit/revolut/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = await response.json();
      await load();
      if (!response.ok || !body.ok)
        throw new Error(body.error ?? "Revolut connection test failed.");
      setNotice("Revolut read access verified.");
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
      const response = await fetch(`/api/cockpit/revolut/connection${query}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not remove Revolut connection.");
      setStatus(null);
      setSummary(null);
      setClientId("");
      setPrivateKeyPem("");
      setAuthorizationCode("");
      setNotice("Revolut connection removed.");
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
            Cockpit / Revolut Business
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Revolut Business
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Read-only balances and 30-day transaction activity. OAuth
            credentials are encrypted at rest and never returned to the browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/cockpit/stripe">Stripe</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/vercel">Vercel</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/website">Website analytics</Link>
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
        <label htmlFor="revolut-scope" className="text-sm font-medium">
          Connection scope
        </label>
        <select
          id="revolut-scope"
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
          <CardTitle>OAuth connection</CardTitle>
          <CardDescription>
            Use the Revolut Business API client ID, its RSA private key, and a
            one-time authorization code generated through Revolut’s consent
            flow. The private key and refresh token are stored encrypted
            server-side. Use a read-only Revolut permission set.
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
                · private key and refresh token stored
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
              No Revolut Business account is connected.
            </p>
          )}
          {(!teamId || status?.canManage) && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="Revolut client ID"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  maxLength={200}
                />
                <Input
                  aria-label="Revolut authorization code"
                  autoComplete="off"
                  type="password"
                  placeholder="One-time authorization code"
                  value={authorizationCode}
                  onChange={(e) => setAuthorizationCode(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <label className="block space-y-2 text-sm">
                <span>RSA private key (PEM)</span>
                <textarea
                  aria-label="Revolut RSA private key PEM"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="min-h-36 w-full rounded-md border bg-background p-3 font-mono text-xs"
                  placeholder={
                    status?.config?.privateKeySet
                      ? "Leave blank to keep saved private key"
                      : "-----BEGIN PRIVATE KEY-----"
                  }
                  value={privateKeyPem}
                  onChange={(e) => setPrivateKeyPem(e.target.value)}
                  maxLength={10_000}
                />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sandbox}
                    onChange={(e) => setSandbox(e.target.checked)}
                  />
                  Sandbox environment
                </label>
                <label className="flex items-center gap-2 text-sm">
                  JWT issuer/redirect domain{" "}
                  <Input
                    aria-label="Revolut JWT issuer domain"
                    placeholder="Defaults to application host"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Large transaction threshold{" "}
                  <Input
                    aria-label="Large transaction threshold"
                    type="number"
                    min={0}
                    max={1_000_000}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-32"
                  />
                </label>
                <Button
                  disabled={
                    loading ||
                    !clientId ||
                    (!privateKeyPem && !status?.connected) ||
                    (!authorizationCode && !status?.connected)
                  }
                  onClick={() => void save()}
                >
                  {busy === "save" && (
                    <LoaderCircle className="size-4 animate-spin" />
                  )}
                  {status?.connected
                    ? "Save / re-authorize"
                    : "Connect Revolut"}
                </Button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Only fixed Revolut Business production or sandbox hosts are
            contacted. The dashboard uses read-only GET requests and limits
            transaction history to 30 days / 1,000 records. Do not paste the RSA
            private key into chat or share it.
          </p>
        </CardContent>
      </Card>
      {busy === "load" && (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading Revolut data…
        </div>
      )}
      {summary && (
        <section className="space-y-4" aria-label="Revolut account summary">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summary.balances.map((item) => (
              <Card key={item.currency}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Active balance · {item.currency}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {money(item.amount, item.currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
            {summary.balances.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active account balances returned.
              </p>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>30-day cash flow</CardTitle>
              <CardDescription>
                Completed external transactions only; exchanges and transfers
                between your own accounts are excluded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.flows30d.map((flow) => (
                <div
                  key={flow.currency}
                  className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"
                >
                  <strong>{flow.currency}</strong>
                  <span>
                    In {money(flow.inflow, flow.currency)} · Out{" "}
                    {money(flow.outflow, flow.currency)}
                  </span>
                </div>
              ))}
              {summary.flows30d.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No completed transaction flows in the period.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>
                Latest 10 records. Large transaction threshold:{" "}
                {number.format(summary.largeTransactionThreshold)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.recent.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"
                >
                  <span>
                    <span className="font-medium">{row.description}</span>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()} · {row.state}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {money(row.amount, row.currency)}
                  </span>
                </div>
              ))}
              {summary.recent.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No recent transactions.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
