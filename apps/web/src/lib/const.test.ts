import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseUrl, getRequiredBaseUrl } from "./const";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

const clearBaseUrlEnv = () => {
  delete process.env.VOIDAGENT_AUTH_URL;
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.BETTER_AUTH_URL;
  delete process.env.AUTH_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
};

describe("getBaseUrl", () => {
  it("prefers VOIDAGENT_AUTH_URL and normalizes trailing slashes", () => {
    clearBaseUrlEnv();
    process.env.VOIDAGENT_AUTH_URL = "https://www.app.voidagent.test///";
    process.env.NEXT_PUBLIC_BASE_URL = "https://fallback.example.com";

    expect(getBaseUrl()).toBe("https://www.app.voidagent.test");
  });

  it("uses NEXT_PUBLIC_BASE_URL as an auth-compatible fallback", () => {
    clearBaseUrlEnv();
    process.env.NEXT_PUBLIC_BASE_URL = "https://app.example.com/";

    expect(getBaseUrl()).toBe("https://app.example.com");
  });

  it("adds https protocol for Vercel host env vars", () => {
    clearBaseUrlEnv();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.voidagent.test";

    expect(getBaseUrl()).toBe("https://app.voidagent.test");
  });

  it("throws a clear error when a required public base URL is unavailable", () => {
    clearBaseUrlEnv();
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getRequiredBaseUrl("MCP OAuth callback")).toThrow(
      /MCP OAuth callback URL is not configured/,
    );
  });
});
