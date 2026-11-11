import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseUrl } from "./const";

const baseUrlEnv = [
  "FLARE_AUTH_URL",
  "NEXT_PUBLIC_BASE_URL",
  "BETTER_AUTH_URL",
  "AUTH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getBaseUrl", () => {
  it("prefers the configured public Void-Agent origin", () => {
    for (const name of baseUrlEnv) vi.stubEnv(name, "");
    vi.stubEnv("FLARE_AUTH_URL", "https://void.example/path");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://fallback.example");

    expect(getBaseUrl()).toBe("https://void.example");
  });

  it("rejects credentials and malformed URLs before trying the next source", () => {
    for (const name of baseUrlEnv) vi.stubEnv(name, "");
    vi.stubEnv("FLARE_AUTH_URL", "https://user:secret@void.example");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "not a valid host / @");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example/callback");

    expect(getBaseUrl()).toBe("https://auth.example");
  });

  it("does not invent a public production origin", () => {
    for (const name of baseUrlEnv) vi.stubEnv(name, "");
    vi.stubEnv("NODE_ENV", "production");

    expect(getBaseUrl()).toBe("");
  });
});
