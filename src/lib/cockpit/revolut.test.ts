import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/cache", () => ({
  serverCache: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));

import {
  createRevolutClientAssertion,
  fetchRevolutSummary,
  summarizeRevolut,
} from "./revolut";

afterEach(() => vi.unstubAllGlobals());

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const config = {
  clientId: "client-123",
  privateKeyPem,
  refreshToken: "refresh-secret",
  sandbox: true,
  issuer: "example.test",
  largeTransactionThreshold: 5000,
};

describe("Revolut Cockpit provider", () => {
  it("signs RS256 client assertions with the expected audience and bounded lifetime", () => {
    const token = createRevolutClientAssertion(config, 1_800_000_000);
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    expect(
      JSON.parse(Buffer.from(encodedHeader, "base64url").toString()),
    ).toEqual({ alg: "RS256", typ: "JWT" });
    expect(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString()),
    ).toEqual({
      iss: "example.test",
      sub: "client-123",
      aud: "https://revolut.com",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(signature).toBeTruthy();
    expect(() =>
      createRevolutClientAssertion({ ...config, issuer: "evil.test/path" }),
    ).toThrow();
  });

  it("uses fixed sandbox host, OAuth refresh and bounded read-only 30-day endpoints", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body === undefined ? undefined : String(init.body),
        });
        if (url.endsWith("/auth/token"))
          return Response.json({
            access_token: "access-secret",
            expires_in: 1200,
          });
        if (url.endsWith("/accounts"))
          return Response.json([
            { id: "acct", balance: 100, currency: "GBP", state: "active" },
          ]);
        if (url.includes("/transactions?")) return Response.json([]);
        return new Response("unexpected", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const summary = await fetchRevolutSummary(config, {
      now: new Date("2026-11-07T00:00:00.000Z"),
    });
    expect(summary.balances).toEqual([{ currency: "GBP", amount: 100 }]);
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe(
      "https://sandbox-b2b.revolut.com/api/1.0/auth/token",
    );
    expect(calls[0].method).toBe("POST");
    expect(calls[1].url).toBe(
      "https://sandbox-b2b.revolut.com/api/1.0/accounts",
    );
    expect(calls[2].url).toContain(
      "https://sandbox-b2b.revolut.com/api/1.0/transactions?",
    );
    expect(calls.slice(1).every((call) => call.method === "GET")).toBe(true);
    expect(new URL(calls[2].url).searchParams.get("count")).toBe("1000");
    expect(new URL(calls[2].url).searchParams.get("from")).toBe(
      "2026-10-08T00:00:00.000Z",
    );
    expect(calls[0].body).toContain("refresh_token=refresh-secret");
    expect(JSON.stringify(summary)).not.toContain("access-secret");
  });

  it("excludes internal transfers and exchanges from cash flow, and includes active balances only", () => {
    const now = new Date("2026-11-07T00:00:00.000Z");
    const result = summarizeRevolut({
      now,
      threshold: 2000,
      accounts: [
        { id: "a", balance: 100, currency: "GBP", state: "active" },
        { id: "b", balance: 500, currency: "GBP", state: "inactive" },
      ],
      transactions: [
        {
          id: "internal",
          type: "transfer",
          state: "completed",
          created_at: now.toISOString(),
          legs: [
            { account_id: "a", amount: -20, currency: "GBP" },
            { account_id: "a", amount: 20, currency: "GBP" },
          ],
        },
        {
          id: "exchange",
          type: "exchange",
          state: "completed",
          created_at: now.toISOString(),
          legs: [{ amount: -10, currency: "GBP" }],
        },
        {
          id: "external",
          type: "card_payment",
          state: "completed",
          created_at: now.toISOString(),
          legs: [{ amount: -12.5, currency: "GBP", description: "Coffee" }],
        },
      ],
    });
    expect(result.balances).toEqual([{ currency: "GBP", amount: 100 }]);
    expect(result.flows30d).toEqual([
      { currency: "GBP", inflow: 0, outflow: 12.5 },
    ]);
    expect(
      result.recent.find((item) => item.id === "external")?.description,
    ).toBe("Coffee");
    expect(result.largeTransactionThreshold).toBe(2000);
  });
});
