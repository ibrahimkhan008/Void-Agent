import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: vi.fn() },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("lib/db/pg/schema.pg", () => ({
  SecurityEventTable: {
    device: "device",
    os: "os",
    browser: "browser",
    country: "country",
    userId: "userId",
    createdAt: "createdAt",
  },
}));
vi.mock("logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));

import {
  computeSecurityFlagsFromEvents,
  isEstablishedAccountSignIn,
  normalizeSecurityLookback,
} from "./security-events";
import type { RequestMetadata } from "./types";

const metadata: RequestMetadata = {
  ip: "198.51.100.10",
  country: "US",
  city: "New York",
  device: "desktop",
  os: "Windows 10+",
  browser: "Chrome",
  userAgent: "bounded user agent",
  referer: "https://example.test",
  timestamp: "2026-11-09T00:00:00.000Z",
};

describe("security event helpers", () => {
  it("does not flag the first recorded device or location", () => {
    expect(computeSecurityFlagsFromEvents([], metadata)).toEqual({
      isNewDevice: false,
      isNewLocation: false,
    });
  });

  it("flags a new device and compares location with the newest event", () => {
    expect(
      computeSecurityFlagsFromEvents(
        [
          { device: "mobile", os: "Android", browser: "Chrome", country: "CA" },
          { device: "tablet", os: "iPadOS", browser: "Safari", country: "US" },
        ],
        metadata,
      ),
    ).toEqual({ isNewDevice: true, isNewLocation: true });
  });

  it("clamps configured historical lookback to safe bounds", () => {
    expect(normalizeSecurityLookback(undefined)).toBe(50);
    expect(normalizeSecurityLookback(0)).toBe(1);
    expect(normalizeSecurityLookback(501)).toBe(500);
    expect(normalizeSecurityLookback(20.8)).toBe(20);
    expect(normalizeSecurityLookback(Number.NaN)).toBe(50);
  });

  it("does not duplicate a signup session as a login event", () => {
    const createdAt = Date.parse("2026-11-09T00:00:00.000Z");
    expect(isEstablishedAccountSignIn(createdAt + 59_999, createdAt)).toBe(
      false,
    );
    expect(isEstablishedAccountSignIn(createdAt + 60_001, createdAt)).toBe(
      true,
    );
    expect(isEstablishedAccountSignIn(Number.NaN, createdAt)).toBe(false);
  });
});
