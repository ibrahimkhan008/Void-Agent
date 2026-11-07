// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MarketingSummary } from "lib/cockpit/website-metrics/types";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { WebsiteAnalyticsPanels } from "./website-analytics-panels";

vi.mock("ui/card", async () => {
  const React = await import("react");
  return {
    Card: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    CardContent: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    CardHeader: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    CardTitle: ({ children, ...props }: React.ComponentProps<"h2">) =>
      React.createElement("h2", props, children),
  };
});

const summary: MarketingSummary = {
  rangeDays: 7,
  visits: 4,
  visitors: 3,
  pageviews: 8,
  leads: 2,
  bookingClicks: 1,
  conversionRate: 0.5,
  previous: { visits: 1, leads: 0 },
  channels: [],
  topPages: [],
  topCampaigns: [],
  daily: [
    { day: "2026-11-01", visits: 2, leads: 1 },
    { day: "2026-11-02", visits: 2, leads: 1 },
  ],
  recentLeads: [],
  breakdowns: {
    channel: [{ key: "organic", visits: 3, leads: 2 }],
    referrer: [{ key: "search.example", visits: 2, leads: 1 }],
    campaign: [{ key: "autumn", visits: 1, leads: 1 }],
    keyword: [{ key: "analytics", visits: 1, leads: 1 }],
    country: [{ key: "US", visits: 2, leads: 1 }],
    region: [{ key: "US-CA", visits: 2, leads: 1 }],
    city: [{ key: "San Francisco", visits: 2, leads: 1 }],
    page: [{ key: "/pricing", visits: 4, leads: 0 }],
    entry: [{ key: "/home", visits: 2, leads: 0 }],
    hostname: [{ key: "example.test", visits: 2, leads: 0 }],
    browser: [{ key: "Firefox", visits: 1, leads: 1 }],
    os: [{ key: "Linux", visits: 1, leads: 1 }],
    device: [{ key: "desktop", visits: 1, leads: 1 }],
  },
};

describe("Website analytics panels", () => {
  test("shows daily activity and exposes each bounded aggregate breakdown", () => {
    render(<WebsiteAnalyticsPanels summary={summary} />);

    expect(
      screen.getByRole("img", {
        name: "Daily visits and leads for the last 7 days",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "2026-11-01: 2 visits, 1 leads; 2026-11-02: 2 visits, 1 leads",
      ),
    ).toBeTruthy();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(13);
    for (const label of [
      "Channel",
      "Referrer",
      "Campaign",
      "Keyword",
      "Country",
      "Region",
      "City",
      "Page",
      "Entry page",
      "Hostname",
      "Browser",
      "Operating system",
      "Device",
    ]) {
      const tab = screen.getByRole("tab", { name: label });
      fireEvent.click(tab);
      const breakdownKeys: Record<string, keyof typeof summary.breakdowns> = {
        Channel: "channel",
        Referrer: "referrer",
        Campaign: "campaign",
        Keyword: "keyword",
        Country: "country",
        Region: "region",
        City: "city",
        Page: "page",
        "Entry page": "entry",
        Hostname: "hostname",
        Browser: "browser",
        "Operating system": "os",
        Device: "device",
      };
      const breakdownKey = breakdownKeys[label];
      if (!breakdownKey) throw new Error(`No breakdown dimension for ${label}`);
      const panel = screen.getByRole("tabpanel", {
        name: `${label} breakdown`,
      });
      expect(
        within(panel).getByText(summary.breakdowns[breakdownKey][0].key),
      ).toBeTruthy();
    }
  });
});
