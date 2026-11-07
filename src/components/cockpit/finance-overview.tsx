"use client";

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

type StripeSnapshot = {
  currency: string;
  balanceAvailable: number;
  balancePending: number;
  mrr: number;
  activeSubscriptions: number;
  payments30d: { count: number; volume: number };
  failed7d: unknown[];
};
type RevolutSummary = {
  balances: Array<{ currency: string; amount: number }>;
  flows30d: Array<{ currency: string; inflow: number; outflow: number }>;
};
type LoadResult<T> = { data: T | null; error: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseStripe(value: unknown): StripeSnapshot | null {
  const data = record(value);
  const payments = record(data?.payments30d);
  if (
    !data ||
    typeof data.currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(data.currency) ||
    !finite(data.balanceAvailable) ||
    !finite(data.balancePending) ||
    !finite(data.mrr) ||
    !finite(data.activeSubscriptions) ||
    !payments ||
    !finite(payments.count) ||
    !finite(payments.volume) ||
    !Array.isArray(data.failed7d)
  )
    return null;
  return {
    currency: data.currency.toUpperCase(),
    balanceAvailable: data.balanceAvailable,
    balancePending: data.balancePending,
    mrr: data.mrr,
    activeSubscriptions: data.activeSubscriptions,
    payments30d: { count: payments.count, volume: payments.volume },
    failed7d: data.failed7d,
  };
}

function parseRevolut(value: unknown): RevolutSummary | null {
  const data = record(value);
  if (!data || !Array.isArray(data.balances) || !Array.isArray(data.flows30d))
    return null;
  const balances = data.balances.flatMap((item) => {
    const row = record(item);
    return row &&
      typeof row.currency === "string" &&
      /^[A-Za-z]{3}$/.test(row.currency) &&
      finite(row.amount)
      ? [{ currency: row.currency.toUpperCase(), amount: row.amount }]
      : [];
  });
  const flows30d = data.flows30d.flatMap((item) => {
    const row = record(item);
    return row &&
      typeof row.currency === "string" &&
      /^[A-Za-z]{3}$/.test(row.currency) &&
      finite(row.inflow) &&
      finite(row.outflow)
      ? [
          {
            currency: row.currency.toUpperCase(),
            inflow: row.inflow,
            outflow: row.outflow,
          },
        ]
      : [];
  });
  return { balances, flows30d };
}

function money(amount: number, currency: string, minor = false) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount / (minor ? 100 : 1));
  } catch {
    return `${(amount / (minor ? 100 : 1)).toFixed(2)} ${currency}`;
  }
}

async function loadSummary<T>(
  url: string,
  parse: (value: unknown) => T | null,
): Promise<LoadResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { data: null, error: true };
    const parsed = parse(await response.json());
    return parsed
      ? { data: parsed, error: false }
      : { data: null, error: true };
  } catch {
    return { data: null, error: true };
  }
}

function ProviderState<T>({
  result,
  data,
  children,
}: {
  result: LoadResult<T> | null;
  data: T | null;
  children: React.ReactNode;
}) {
  if (!result)
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading financial summary…
      </p>
    );
  if (!data)
    return (
      <p
        role="status"
        className="flex items-start gap-2 text-sm text-muted-foreground"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {result.error
          ? "Financial data is unavailable. Open the provider dashboard to reconnect or retry."
          : "No financial summary is available."}
      </p>
    );
  return <>{children}</>;
}

export function FinanceOverview({ teamId }: { teamId: string | null }) {
  const [stripe, setStripe] = useState<LoadResult<StripeSnapshot> | null>(null);
  const [revolut, setRevolut] = useState<LoadResult<RevolutSummary> | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const scope = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  useEffect(() => {
    let active = true;
    setStripe(null);
    setRevolut(null);
    setRefreshing(true);
    void Promise.all([
      loadSummary(`/api/cockpit/stripe/summary${scope}`, parseStripe),
      loadSummary(`/api/cockpit/revolut/summary${scope}`, parseRevolut),
    ]).then(([stripeResult, revolutResult]) => {
      if (!active) return;
      setStripe(stripeResult);
      setRevolut(revolutResult);
      setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [scope, revision]);

  return (
    <section aria-label="Unified finance summary" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Finance overview</h2>
          <p className="text-sm text-muted-foreground">
            Provider balances and activity stay in their reported currencies.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRevision((value) => value + 1)}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle
              aria-hidden="true"
              className="mr-2 size-4 animate-spin"
            />
          ) : (
            <RefreshCw aria-hidden="true" className="mr-2 size-4" />
          )}
          Refresh finance
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stripe</CardTitle>
            <CardDescription>
              Balances, recurring revenue, and payment activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderState result={stripe} data={stripe?.data ?? null}>
              {stripe?.data && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Metric
                    label="Available balance"
                    value={money(
                      stripe.data.balanceAvailable,
                      stripe.data.currency,
                      true,
                    )}
                  />
                  <Metric
                    label="Pending balance"
                    value={money(
                      stripe.data.balancePending,
                      stripe.data.currency,
                      true,
                    )}
                  />
                  <Metric
                    label="Monthly recurring revenue"
                    value={money(stripe.data.mrr, stripe.data.currency, true)}
                  />
                  <Metric
                    label="Active subscriptions"
                    value={String(stripe.data.activeSubscriptions)}
                  />
                  <Metric
                    label="Payments, last 30 days"
                    value={`${stripe.data.payments30d.count} · ${money(stripe.data.payments30d.volume, stripe.data.currency, true)}`}
                  />
                  <Metric
                    label="Failed charges, last 7 days"
                    value={String(stripe.data.failed7d.length)}
                  />
                </dl>
              )}
            </ProviderState>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revolut Business</CardTitle>
            <CardDescription>
              Available balances and 30-day account flows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderState result={revolut} data={revolut?.data ?? null}>
              {revolut?.data && (
                <div className="space-y-4">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Balances</h3>
                    {revolut.data.balances.length ? (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {revolut.data.balances.map((balance) => (
                          <Metric
                            key={balance.currency}
                            label={balance.currency}
                            value={money(balance.amount, balance.currency)}
                          />
                        ))}
                      </dl>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No balances reported.
                      </p>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Last 30 days</h3>
                    {revolut.data.flows30d.length ? (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {revolut.data.flows30d.flatMap((flow) => [
                          <Metric
                            key={`${flow.currency}-in`}
                            label={`${flow.currency} inflow`}
                            value={money(flow.inflow, flow.currency)}
                          />,
                          <Metric
                            key={`${flow.currency}-out`}
                            label={`${flow.currency} outflow`}
                            value={money(flow.outflow, flow.currency)}
                          />,
                        ])}
                      </dl>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No recent flows reported.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ProviderState>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
