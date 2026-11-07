import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
import { isRestrictedStripeKey, probeStripe, summarizeStripe } from "./stripe";

afterEach(() => vi.unstubAllGlobals());

describe("Cockpit Stripe", () => {
  it("accepts only restricted Stripe key formats", () => {
    expect(isRestrictedStripeKey("rk_test_AbCd12345678")).toBe(true);
    expect(isRestrictedStripeKey("sk_live_AbCd12345678")).toBe(false);
    expect(isRestrictedStripeKey("rk_test_short")).toBe(false);
    expect(isRestrictedStripeKey("rk_live_AbCd12345678\n")).toBe(false);
  });

  it("summarizes balances, normalized recurring revenue, payments, failures and payout", () => {
    const nowSeconds = 1_800_000_000;
    const recent = nowSeconds - 60;
    const result = summarizeStripe({
      nowSeconds,
      balance: {
        available: [{ amount: 12500, currency: "usd" }],
        pending: [{ amount: 2500, currency: "usd" }],
      },
      subscriptions: [
        {
          id: "sub_1",
          items: {
            data: [
              {
                quantity: 2,
                price: {
                  currency: "usd",
                  unit_amount: 1000,
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
              {
                quantity: 1,
                price: {
                  currency: "eur",
                  unit_amount: 900,
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
            ],
          },
        },
      ],
      charges: [
        {
          id: "ch_ok",
          amount: 4000,
          amount_refunded: 500,
          currency: "usd",
          created: recent,
          status: "succeeded",
          paid: true,
          description: "Order",
        },
        {
          id: "ch_failed",
          amount: 2000,
          amount_refunded: 0,
          currency: "usd",
          created: recent,
          status: "failed",
          paid: false,
          description: null,
        },
        {
          id: "ch_old",
          amount: 9900,
          amount_refunded: 0,
          currency: "usd",
          created: nowSeconds - 40 * 86400,
          status: "succeeded",
          paid: true,
          description: null,
        },
      ],
      payouts: [
        {
          amount: 3000,
          currency: "usd",
          arrival_date: nowSeconds + 86400,
          status: "pending",
        },
      ],
    });
    expect(result).toMatchObject({
      currency: "usd",
      balanceAvailable: 12500,
      balancePending: 2500,
      mrr: 2000,
      activeSubscriptions: 1,
      payments30d: { count: 1, volume: 3500 },
      failed7d: [{ id: "ch_failed" }],
      nextPayout: { amount: 3000, status: "pending" },
    });
  });

  it("probes only Stripe's fixed HTTPS API and does not expose response content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await probeStripe("rk_test_AbCd12345678");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/balance");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer rk_test_AbCd12345678");
  });

  it("turns provider failures into a generic error without exposing the response body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "private account detail" } }),
          { status: 403 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeStripe("rk_test_AbCd12345678")).rejects.toThrow(
      "stripe_auth",
    );
    await expect(probeStripe("rk_test_AbCd12345678")).rejects.not.toThrow(
      "private account detail",
    );
  });

  it("rejects oversized and malformed provider JSON without returning its contents", async () => {
    const oversized = "secret-provider-payload-".padEnd(
      2 * 1024 * 1024 + 10,
      "x",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(oversized, { status: 200 }))
      .mockResolvedValueOnce(
        new Response("not-json-sensitive-body", { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeStripe("rk_test_AbCd12345678")).rejects.toThrow(
      "stripe_invalid_response",
    );
    await expect(probeStripe("rk_test_AbCd12345678")).rejects.not.toThrow(
      "sensitive-body",
    );
  });
});
