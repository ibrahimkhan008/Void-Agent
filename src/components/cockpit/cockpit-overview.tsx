"use client";

import {
  COCKPIT_PROVIDERS,
  type CockpitConnectionState,
  type CockpitConnectionStatus,
  type CockpitOperationalAlert,
  buildCockpitOperationalAlerts,
  classifyCockpitConnection,
  parseCockpitConnectionStatus,
} from "lib/cockpit/overview";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { CockpitUpdates } from "./cockpit-updates";
import { FinanceOverview } from "./finance-overview";

type TeamChoice = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};
type ProviderResult = {
  status: CockpitConnectionStatus | null;
  error: boolean;
};
type ProviderResults = Record<string, ProviderResult>;
type OperationalFeed = {
  alerts: CockpitOperationalAlert[];
  unavailable: boolean;
};

const stateLabels: Record<CockpitConnectionState, string> = {
  ready: "Connected and verified",
  "needs-attention": "Connection needs attention",
  "connected-untested": "Connected, not tested",
  "not-connected": "Not connected",
  unavailable: "Status unavailable",
};

function StateIcon({ state }: { state: CockpitConnectionState }) {
  if (state === "ready")
    return (
      <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
    );
  if (state === "needs-attention")
    return (
      <TriangleAlert aria-hidden="true" className="size-4 text-amber-600" />
    );
  if (state === "unavailable")
    return (
      <CircleHelp aria-hidden="true" className="size-4 text-muted-foreground" />
    );
  if (state === "not-connected")
    return (
      <AlertCircle
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
    );
  return <ShieldCheck aria-hidden="true" className="size-4 text-blue-600" />;
}

export function CockpitOverview() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [results, setResults] = useState<ProviderResults>({});
  const [operationalFeed, setOperationalFeed] = useState<OperationalFeed>({
    alerts: [],
    unavailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestNumber = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/projects/teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { teams?: TeamChoice[] };
        if (active) setTeams(body.teams ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const loadStatuses = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true);
    setRefreshing(true);
    setResults({});
    setOperationalFeed({ alerts: [], unavailable: false });
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const [entries, operational] = await Promise.all([
      Promise.all(
        COCKPIT_PROVIDERS.map(async (provider) => {
          try {
            const response = await fetch(`${provider.statusEndpoint}${query}`, {
              cache: "no-store",
            });
            if (!response.ok) throw new Error("status unavailable");
            const body = parseCockpitConnectionStatus(await response.json());
            if (!body) throw new Error("invalid status response");
            return [provider.id, { status: body, error: false }] as const;
          } catch {
            return [provider.id, { status: null, error: true }] as const;
          }
        }),
      ),
      Promise.all(
        [
          "/api/cockpit/vercel/deployments",
          "/api/cockpit/superlog/summary",
        ].map(async (endpoint) => {
          try {
            const response = await fetch(`${endpoint}${query}`, {
              cache: "no-store",
            });
            if (!response.ok) throw new Error("operational data unavailable");
            const value: unknown = await response.json();
            const collection =
              endpoint === "/api/cockpit/vercel/deployments"
                ? "projects"
                : "incidents";
            if (
              !value ||
              typeof value !== "object" ||
              !Array.isArray((value as Record<string, unknown>)[collection])
            )
              throw new Error("invalid operational data");
            return { ok: true as const, value };
          } catch {
            return { ok: false as const, value: null };
          }
        }),
      ),
    ]);
    if (currentRequest !== requestNumber.current) return;
    setResults(Object.fromEntries(entries));
    setOperationalFeed({
      alerts: buildCockpitOperationalAlerts(
        operational[0]?.value,
        operational[1]?.value,
      ),
      unavailable: operational.some((result) => !result.ok),
    });
    setLoading(false);
    setRefreshing(false);
  }, [teamId]);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const connectedCount = Object.values(results).filter(
    (result) => result.status?.connected,
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Void-Agent / Cockpit
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Operations overview
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review the status of your connected business, analytics, deployment,
            and incident providers from one place.
          </p>
        </div>
        <Button
          onClick={() => void loadStatuses()}
          variant="outline"
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
          Refresh status
        </Button>
      </header>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <label className="text-sm font-medium" htmlFor="cockpit-overview-scope">
          Connection scope
        </label>
        <select
          id="cockpit-overview-scope"
          className="h-9 rounded-md border bg-background px-3 text-sm"
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
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Checking provider connections…"
            : `${connectedCount} of ${COCKPIT_PROVIDERS.length} providers connected`}
        </p>
      </section>

      <section
        aria-label="Provider connection status"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {COCKPIT_PROVIDERS.map((provider) => {
          const result = results[provider.id];
          const state = classifyCockpitConnection(result?.status ?? null);
          return (
            <Card key={provider.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{provider.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {provider.description}
                    </CardDescription>
                  </div>
                  <StateIcon state={state} />
                </div>
                <p className="text-sm font-medium" aria-live="polite">
                  {loading && !result ? "Checking…" : stateLabels[state]}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {result?.status?.lastTestedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last tested{" "}
                    {new Date(result.status.lastTestedAt).toLocaleString()}
                  </p>
                )}
                {result?.error && (
                  <p className="text-xs text-muted-foreground">
                    This provider’s status could not be checked. Open its
                    dashboard to retry.
                  </p>
                )}
                <Button asChild className="w-full" variant="outline">
                  <Link href={provider.href}>
                    Open dashboard
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <FinanceOverview teamId={teamId} />

      <CockpitUpdates />

      <section aria-label="Operational alerts" className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Operational alerts
          </h2>
          <p className="text-sm text-muted-foreground">
            Current production deployment failures and open incidents.
          </p>
        </div>
        {operationalFeed.unavailable && (
          <p
            role="status"
            className="rounded-md border p-3 text-sm text-muted-foreground"
          >
            Latest deployment or incident data could not be loaded. Check the
            Vercel and Superlog dashboards.
          </p>
        )}
        {!operationalFeed.unavailable &&
          operationalFeed.alerts.length === 0 &&
          !loading && (
            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              No deployment failures or open incidents were reported.
            </p>
          )}
        {operationalFeed.alerts.length > 0 && (
          <ul className="space-y-2">
            {operationalFeed.alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {alert.detail}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {alert.occurredAt &&
                    Number.isFinite(Date.parse(alert.occurredAt)) && (
                      <time dateTime={alert.occurredAt}>
                        {new Date(alert.occurredAt).toLocaleString()}
                      </time>
                    )}
                  <Link
                    className="underline underline-offset-4"
                    href={
                      alert.provider === "vercel"
                        ? "/cockpit/vercel"
                        : "/cockpit/superlog"
                    }
                  >
                    Open {alert.provider === "vercel" ? "Vercel" : "Superlog"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Credentials remain encrypted server-side and are never returned to the
        overview. Financial summaries use the selected personal or team scope.
      </p>
    </main>
  );
}
