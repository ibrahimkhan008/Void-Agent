// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceOverview } from "./finance-overview";

vi.mock("ui/card", async () => {
  const ReactModule = await import("react");
  return {
    Card: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardContent: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardDescription: ({ children, ...props }: React.ComponentProps<"p">) =>
      ReactModule.createElement("p", props, children),
    CardHeader: ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props, children),
    CardTitle: ({ children, ...props }: React.ComponentProps<"h2">) =>
      ReactModule.createElement("h2", props, children),
  };
});

vi.mock("ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({ children, ...props }: React.ComponentProps<"button">) =>
      ReactModule.createElement("button", props, children),
  };
});

const fetchMock = vi.fn();

describe("FinanceOverview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the selected scope and keeps provider currencies separate", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("stripe"))
        return {
          ok: true,
          json: async () => ({
            currency: "usd",
            balanceAvailable: 12345,
            balancePending: 500,
            mrr: 9000,
            activeSubscriptions: 4,
            payments30d: { count: 9, volume: 70000 },
            failed7d: [],
          }),
        };
      return {
        ok: true,
        json: async () => ({
          balances: [
            { currency: "EUR", amount: 123.45 },
            { currency: "USD", amount: 300 },
          ],
          flows30d: [
            { currency: "EUR", inflow: 200, outflow: 50 },
            { currency: "USD", inflow: 400, outflow: 100 },
          ],
        }),
      };
    });

    render(<FinanceOverview teamId="team-1" />);

    expect(await screen.findByText("$123.45")).toBeTruthy();
    expect(screen.getByText("€123.45")).toBeTruthy();
    expect(screen.getByText("Available balance")).toBeTruthy();
    expect(screen.getByText("EUR inflow")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cockpit/stripe/summary?teamId=team-1",
      { cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cockpit/revolut/summary?teamId=team-1",
      { cache: "no-store" },
    );
  });

  it("keeps a failed provider independent from the other provider", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("stripe"))
        return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          balances: [{ currency: "GBP", amount: 55 }],
          flows30d: [],
        }),
      };
    });

    render(<FinanceOverview teamId={null} />);

    expect(
      await screen.findByText(/Financial data is unavailable/),
    ).toBeTruthy();
    expect(screen.getByText("£55.00")).toBeTruthy();
  });

  it("rejects malformed financial data instead of rendering provider values", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ balanceAvailable: 999999 }),
    });

    render(<FinanceOverview teamId={null} />);

    expect(
      await screen.findAllByText(/Financial data is unavailable/),
    ).toHaveLength(2);
    expect(screen.queryByText("999999")).toBeNull();
  });
});
