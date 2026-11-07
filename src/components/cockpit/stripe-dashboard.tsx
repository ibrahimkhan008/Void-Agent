"use client";

import type { StripeSnapshot } from "lib/cockpit/stripe";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
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
type Busy = "load" | "save" | "test" | "refresh" | "remove" | null;
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);

export function StripeDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StripeSnapshot | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<Busy>("load");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scopeQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const loadStatus = useCallback(async () => {
    const response = await fetch(
      `/api/cockpit/stripe/connection${scopeQuery}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Could not load connection status.");
    setStatus(await response.json());
  }, [scopeQuery]);

  const loadSnapshot = useCallback(async () => {
    setBusy("refresh");
    setError(null);
    try {
      const response = await fetch(`/api/cockpit/stripe/summary${scopeQuery}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load Stripe data.");
      setSnapshot(body as StripeSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Stripe data.");
    } finally {
      setBusy(null);
    }
  }, [scopeQuery]);

  useEffect(() => {
    void fetch("/api/projects/teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { teams?: TeamChoice[] };
        setTeams(body.teams ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setBusy("load");
        const response = await fetch(
          `/api/cockpit/stripe/connection${scopeQuery}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Could not load connection status.");
        const data = (await response.json()) as Status;
        if (!active) return;
        setStatus(data);
        if (data.connected) {
          const summaryResponse = await fetch(
            `/api/cockpit/stripe/summary${scopeQuery}`,
            { cache: "no-store" },
          );
          const body = await summaryResponse.json();
          if (!summaryResponse.ok)
            throw new Error(body.error ?? "Could not load Stripe data.");
          if (active) setSnapshot(body as StripeSnapshot);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Cockpit could not be loaded.",
          );
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [scopeQuery]);

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/stripe/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restrictedKey: key, teamId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save connection.");
      setKey("");
      setStatus(body);
      setNotice("Encrypted connection saved. Test it to confirm permissions.");
      setSnapshot(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save connection.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/stripe/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = await response.json();
      await loadStatus();
      if (!response.ok || !body.ok)
        throw new Error(
          body.error ??
            "Stripe rejected the connection. Check the restricted key permissions.",
        );
      setNotice("Stripe connection verified.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const response = await fetch(
        `/api/cockpit/stripe/connection${scopeQuery}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not remove connection.");
      setStatus({
        connected: false,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: null,
        canManage: true,
      });
      setSnapshot(null);
      setNotice("Stripe connection removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove connection.");
    } finally {
      setBusy(null);
    }
  }

  const loading = busy !== null;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDollarSign className="size-4" /> Cockpit / Finance
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Stripe financial overview
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Read-only account balances, subscription revenue, recent payments,
            and the next payout.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/cockpit/vercel">Vercel deployments</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/website">Website analytics</Link>
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
              onClick={() => void loadSnapshot()}
              disabled={loading}
            >
              <RefreshCw className="size-4" /> Refresh data
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="cockpit-scope" className="text-sm font-medium">
          Connection scope
        </label>
        <select
          id="cockpit-scope"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={teamId ?? "personal"}
          onChange={(event) => {
            setTeamId(
              event.target.value === "personal" ? null : event.target.value,
            );
            setSnapshot(null);
            setError(null);
            setNotice(null);
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
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stripe connection</CardTitle>
          <CardDescription>
            Use a restricted key with read access to Balance, Subscriptions,
            Charges, and Payouts. The key is encrypted at rest and is never
            returned by the API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                {status.lastTestOk ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600" />
                )}
                <span>
                  Key stored ·{" "}
                  {status.lastTestedAt
                    ? status.lastTestOk
                      ? "verified"
                      : "test failed"
                    : "not tested"}
                </span>
              </div>
              {status.canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void test()}
                    disabled={loading}
                  >
                    {busy === "test" && (
                      <LoaderCircle className="size-4 animate-spin" />
                    )}
                    Test key
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void remove()}
                    disabled={loading}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Stripe account is connected.
            </p>
          )}
          {(!teamId || status?.canManage) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Stripe restricted key"
                autoComplete="new-password"
                type="password"
                placeholder={
                  status?.connected
                    ? "Enter a new restricted key to rotate"
                    : "rk_live_… or rk_test_…"
                }
                value={key}
                onChange={(e) => setKey(e.target.value)}
                maxLength={256}
              />
              <Button
                onClick={() => void save()}
                disabled={loading || key.length < 12}
              >
                {busy === "save" && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                {status?.connected ? "Replace key" : "Connect Stripe"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Only read permissions are used. This Cockpit never creates charges,
            changes subscriptions, or initiates payouts.
          </p>
        </CardContent>
      </Card>

      {busy === "load" && (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading Stripe overview…
        </div>
      )}
      {snapshot && (
        <section className="space-y-4" aria-label="Stripe financial snapshot">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Available balance",
                money(snapshot.balanceAvailable, snapshot.currency),
              ],
              [
                "Pending balance",
                money(snapshot.balancePending, snapshot.currency),
              ],
              [
                "Monthly recurring revenue",
                money(snapshot.mrr, snapshot.currency),
              ],
              ["Active subscriptions", String(snapshot.activeSubscriptions)],
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
                <CardTitle>Payments · 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {money(snapshot.payments30d.volume, snapshot.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {snapshot.payments30d.count} successful payments
                </p>
                <h3 className="mb-2 mt-6 text-sm font-medium">
                  Failed charges · 7 days
                </h3>
                {snapshot.failed7d.length ? (
                  <ul className="space-y-2">
                    {snapshot.failed7d.map((charge) => (
                      <li
                        key={charge.id}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="truncate">
                          {charge.description ?? charge.id}
                        </span>
                        <span className="shrink-0 tabular-nums text-destructive">
                          {money(charge.amount, charge.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No failed charges in the last 7 days.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Next payout</CardTitle>
              </CardHeader>
              <CardContent>
                {snapshot.nextPayout ? (
                  <>
                    <p className="text-2xl font-semibold">
                      {money(snapshot.nextPayout.amount, snapshot.currency)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(
                        snapshot.nextPayout.arrivalDate,
                      ).toLocaleDateString()}{" "}
                      · {snapshot.nextPayout.status}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No upcoming payout is available.
                  </p>
                )}
                <p className="mt-6 text-xs text-muted-foreground">
                  Updated {new Date(snapshot.generatedAt).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </main>
  );
}
