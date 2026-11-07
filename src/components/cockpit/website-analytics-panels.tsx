"use client";

import type {
  BreakdownKey,
  MarketingSummary,
} from "lib/cockpit/website-metrics/types";
import { useState } from "react";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

const BREAKDOWN_GROUPS: ReadonlyArray<readonly BreakdownKey[]> = [
  ["channel", "referrer", "campaign", "keyword"],
  ["country", "region", "city"],
  ["page", "entry", "hostname"],
  ["browser", "os", "device"],
];

const LABELS: Record<BreakdownKey, string> = {
  channel: "Channel",
  referrer: "Referrer",
  campaign: "Campaign",
  keyword: "Keyword",
  country: "Country",
  region: "Region",
  city: "City",
  page: "Page",
  entry: "Entry page",
  hostname: "Hostname",
  browser: "Browser",
  os: "Operating system",
  device: "Device",
};

const count = new Intl.NumberFormat();

export function WebsiteAnalyticsPanels({
  summary,
}: {
  summary: MarketingSummary;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DailyTrafficCard summary={summary} />
      {BREAKDOWN_GROUPS.map((dimensions) => (
        <BreakdownCard
          key={dimensions[0]}
          summary={summary}
          dimensions={dimensions}
        />
      ))}
    </div>
  );
}

function DailyTrafficCard({ summary }: { summary: MarketingSummary }) {
  const daily = summary.daily;
  const maxVisits = Math.max(1, ...daily.map((day) => day.visits));
  const maxLeads = Math.max(1, ...daily.map((day) => day.leads));
  const width = 600;
  const height = 160;
  const xStep = daily.length > 1 ? width / (daily.length - 1) : width;
  const points = daily
    .map((day, index) => {
      const x = daily.length > 1 ? index * xStep : width / 2;
      const y = height - 12 - (day.visits / maxVisits) * (height - 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily visits and leads</CardTitle>
      </CardHeader>
      <CardContent>
        {daily.length ? (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-40 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Daily visits and leads for the last ${summary.rangeDays} days`}
            >
              {[0.25, 0.5, 0.75].map((fraction) => (
                <line
                  key={fraction}
                  x1="0"
                  x2={width}
                  y1={height * fraction}
                  y2={height * fraction}
                  stroke="currentColor"
                  opacity="0.12"
                />
              ))}
              {daily.map((day, index) => {
                if (day.leads === 0) return null;
                const x = daily.length > 1 ? index * xStep : width / 2;
                const barHeight = (day.leads / maxLeads) * 48;
                return (
                  <rect
                    key={day.day}
                    x={x - Math.max(2, Math.min(6, xStep / 3))}
                    y={height - barHeight}
                    width={Math.max(4, Math.min(12, xStep * 0.6))}
                    height={barHeight}
                    fill="#d946ef"
                    opacity="0.75"
                  >
                    <title>{`${day.day}: ${count.format(day.leads)} leads`}</title>
                  </rect>
                );
              })}
              <polyline
                points={points}
                fill="none"
                stroke="#16a34a"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-green-600"
                />
                Visits
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-fuchsia-500"
                />
                Leads
              </span>
            </div>
            <p className="sr-only">
              {daily
                .map(
                  (day) =>
                    `${day.day}: ${count.format(day.visits)} visits, ${count.format(day.leads)} leads`,
                )
                .join("; ")}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No activity in this range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  summary,
  dimensions,
}: {
  summary: MarketingSummary;
  dimensions: readonly BreakdownKey[];
}) {
  const [active, setActive] = useState<BreakdownKey>(dimensions[0]);
  const rows = summary.breakdowns[active] ?? [];
  const maxValue = Math.max(1, ...rows.map((row) => row.visits));
  const metricLabel = active === "page" ? "pageviews" : "visits";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div
          role="tablist"
          aria-label="Website breakdown dimensions"
          className="flex flex-wrap gap-1"
        >
          {dimensions.map((dimension) => (
            <button
              key={dimension}
              type="button"
              role="tab"
              aria-selected={active === dimension}
              aria-controls={`website-breakdown-${dimensions[0]}`}
              onClick={() => setActive(dimension)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted aria-selected:bg-muted aria-selected:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {LABELS[dimension]}
            </button>
          ))}
        </div>
        <CardTitle className="text-base">{LABELS[active]} breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          id={`website-breakdown-${dimensions[0]}`}
          role="tabpanel"
          aria-label={`${LABELS[active]} breakdown`}
          className="max-h-72 space-y-2 overflow-y-auto"
        >
          {rows.length ? (
            rows.map((row) => (
              <div
                key={row.key}
                className="relative flex min-h-9 items-center justify-between gap-3 overflow-hidden rounded-md px-2 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                  style={{
                    width: `${Math.max(2, (row.visits / maxValue) * 100)}%`,
                  }}
                />
                <span className="relative min-w-0 truncate">{row.key}</span>
                <span className="relative shrink-0 text-right tabular-nums text-muted-foreground">
                  {count.format(row.visits)} {metricLabel}
                  {row.leads > 0 && ` · ${count.format(row.leads)} leads`}
                </span>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity in this range.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
