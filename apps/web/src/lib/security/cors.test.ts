import { afterEach, describe, expect, it } from "vitest";
import {
  isAllowedCheckoutOrigin,
  marketingCorsPreflight,
  withMarketingCors,
} from "./cors";

const MARKETING = "https://voidagent.space";
const SELF = "https://app.voidagent.space";

function requestFor(
  origin: string | null,
  path = "/api/payments/dodo/checkout",
) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(`${SELF}${path}`, { headers });
}

describe("checkout CORS allowlist", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
  });

  it("accepts the exact marketing origin and same-origin", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    expect(isAllowedCheckoutOrigin(requestFor(MARKETING))).toBe(true);
    expect(isAllowedCheckoutOrigin(requestFor(SELF))).toBe(true);
  });

  it("rejects lookalike hosts, other subdomains and missing origins", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    expect(isAllowedCheckoutOrigin(requestFor(null))).toBe(false);
    expect(
      isAllowedCheckoutOrigin(requestFor("https://voidagent.space.evil.com")),
    ).toBe(false);
    expect(isAllowedCheckoutOrigin(requestFor("http://voidagent.space"))).toBe(
      false,
    );
    expect(isAllowedCheckoutOrigin(requestFor("https://evil.com"))).toBe(false);
  });

  it("preflight answers only the marketing origin with the credential headers", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    const ok = marketingCorsPreflight(requestFor(MARKETING));
    expect(ok?.status).toBe(204);
    expect(ok?.headers.get("Access-Control-Allow-Origin")).toBe(MARKETING);
    expect(ok?.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(ok?.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(ok?.headers.get("Vary")).toBe("Origin");
    expect(marketingCorsPreflight(requestFor("https://evil.com"))).toBeNull();
    expect(marketingCorsPreflight(requestFor(null))).toBeNull();
  });

  it("attaches CORS headers to error responses for the marketing origin only", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    const error = withMarketingCors(
      new Response(null, { status: 401 }),
      requestFor(MARKETING),
    );
    expect(error.status).toBe(401);
    expect(error.headers.get("Access-Control-Allow-Origin")).toBe(MARKETING);
    expect(error.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    // Same-origin and foreign callers get no CORS headers at all.
    expect(
      withMarketingCors(new Response(null), requestFor(SELF)).headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBeNull();
    expect(
      withMarketingCors(
        new Response(null),
        requestFor("https://evil.com"),
      ).headers.get("Access-Control-Allow-Origin"),
    ).toBeNull();
  });
});
