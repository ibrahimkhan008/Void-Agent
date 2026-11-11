import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: vi.fn() },
}));

import {
  buildRequestMetadata,
  sanitizeRequestMetadata,
} from "./request-metadata";

describe("buildRequestMetadata", () => {
  const now = new Date("2026-11-09T00:00:00.000Z");

  it("validates proxy IPs, bounds fields and stores only the referer origin", () => {
    const requestHeaders = new Headers({
      "cf-connecting-ip": "not-an-ip",
      "x-forwarded-for": "2001:db8::8, 10.0.0.1",
      "cf-ipcountry": "us",
      "cf-ipcity": "New York " + "A".repeat(120),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      referer: "https://example.test/path?token=must-not-be-stored#fragment",
    });

    expect(buildRequestMetadata(requestHeaders, null, now)).toEqual({
      ip: "2001:db8::8",
      country: "US",
      city: ("New York " + "A".repeat(120)).slice(0, 100),
      device: "desktop",
      os: "Windows 10+",
      browser: "Chrome",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      referer: "https://example.test",
      timestamp: now.toISOString(),
    });
  });

  it("does not allow config to select arbitrary attacker-controlled headers", () => {
    const requestHeaders = new Headers({
      "x-forwarded-for": "198.51.100.9",
      "x-user-ip": "203.0.113.4",
    });

    expect(
      buildRequestMetadata(
        requestHeaders,
        { ipHeaderPriority: ["x-user-ip"] },
        now,
      ).ip,
    ).toBe("198.51.100.9");
  });

  it("rejects malformed IP and non-HTTP referers", () => {
    const requestHeaders = new Headers({
      "cf-connecting-ip": "attacker-value",
      referer: "javascript:alert(1)",
    });

    const metadata = buildRequestMetadata(requestHeaders, null, now);
    expect(metadata.ip).toBe("unknown");
    expect(metadata.referer).toBeNull();
  });

  it("sanitizes metadata again at the persistence boundary", () => {
    const sanitized = sanitizeRequestMetadata({
      ip: "not-an-ip",
      country: "US/secret",
      city: "A".repeat(130),
      device: "desktop" + "x".repeat(50),
      os: "Windows",
      browser: "Chrome",
      userAgent: "ua" + "x".repeat(600),
      referer: "https://example.test/path?access_token=secret",
      timestamp: "not-a-date",
    });

    expect(sanitized.ip).toBe("unknown");
    expect(sanitized.country).toBeNull();
    expect(sanitized.city).toHaveLength(100);
    expect(sanitized.device).toBe("desktop");
    expect(sanitized.userAgent).toHaveLength(512);
    expect(sanitized.referer).toBe("https://example.test");
    expect(Number.isNaN(Date.parse(sanitized.timestamp))).toBe(false);
  });

  it("never reads or persists authorization and cookie headers", () => {
    const requestHeaders = new Headers({
      authorization: "Bearer raw-secret-token",
      cookie: "session=raw-session-cookie",
      "cf-connecting-ip": "198.51.100.12",
    });
    const metadata = buildRequestMetadata(requestHeaders, null, now);
    expect(JSON.stringify(metadata)).not.toContain("raw-secret-token");
    expect(JSON.stringify(metadata)).not.toContain("raw-session-cookie");
  });
});
