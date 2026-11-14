import { afterEach, describe, expect, it } from "vitest";
import { callbackUrlQuery, sanitizeCallbackUrl } from "./callback-url";

const MARKETING = "https://voidagent.space";

describe("sanitizeCallbackUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
  });

  it("accepts in-app relative paths", () => {
    expect(sanitizeCallbackUrl("/accept-invitation/abc")).toBe(
      "/accept-invitation/abc",
    );
    expect(sanitizeCallbackUrl("/")).toBe("/");
  });

  it("takes the first entry of a repeated query param", () => {
    expect(sanitizeCallbackUrl(["/a", "/b"])).toBe("/a");
  });

  it("rejects open-redirect and non-relative targets", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    expect(sanitizeCallbackUrl("https://evil.com")).toBeUndefined();
    expect(sanitizeCallbackUrl("//evil.com")).toBeUndefined();
    expect(sanitizeCallbackUrl("/\\evil.com")).toBeUndefined();
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeCallbackUrl("")).toBeUndefined();
    expect(sanitizeCallbackUrl(undefined)).toBeUndefined();
    expect(sanitizeCallbackUrl(null)).toBeUndefined();
  });

  it("accepts an absolute URL only for the exact marketing origin", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = MARKETING;
    // Full checkout-intent return from the marketing pricing page.
    expect(
      sanitizeCallbackUrl(
        `${MARKETING}/pricing?plan=pro&billing=annual&retry=1`,
      ),
    ).toBe(`${MARKETING}/pricing?plan=pro&billing=annual&retry=1`);
    // Lookalikes and other subdomains of the same site are rejected.
    expect(
      sanitizeCallbackUrl("https://voidagent.space.evil.com/pricing"),
    ).toBeUndefined();
    expect(
      sanitizeCallbackUrl("https://app.voidagent.space/pricing"),
    ).toBeUndefined();
    expect(
      sanitizeCallbackUrl("http://voidagent.space/pricing"),
    ).toBeUndefined();
  });

  it("resolves the origin through getMarketingUrl when the env is unset", () => {
    // With the env unset the helper resolves its environment-aware default
    // (localhost:3001 under test) — so the production marketing URL must
    // NOT pass, and the resolved dev origin would.
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    expect(sanitizeCallbackUrl("https://evil.com/pricing")).toBeUndefined();
    expect(sanitizeCallbackUrl(`${MARKETING}/pricing`)).toBeUndefined();
    expect(sanitizeCallbackUrl("http://localhost:3001/pricing")).toBe(
      "http://localhost:3001/pricing",
    );
  });
});

describe("callbackUrlQuery", () => {
  it("builds an encoded query suffix when present", () => {
    expect(callbackUrlQuery("/accept-invitation/abc")).toBe(
      "?callbackUrl=%2Faccept-invitation%2Fabc",
    );
  });

  it("returns an empty string when absent", () => {
    expect(callbackUrlQuery(undefined)).toBe("");
  });
});
