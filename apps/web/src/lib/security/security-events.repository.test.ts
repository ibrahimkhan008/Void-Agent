import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  desc: vi.fn((column: unknown) => ({ desc: column })),
  userIdColumn: { name: "user_id" },
  createdAtColumn: { name: "created_at" },
  deviceColumn: { name: "device" },
  osColumn: { name: "os" },
  browserColumn: { name: "browser" },
  countryColumn: { name: "country" },
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: mocks.getConfig },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  SecurityEventTable: {
    userId: mocks.userIdColumn,
    createdAt: mocks.createdAtColumn,
    device: mocks.deviceColumn,
    os: mocks.osColumn,
    browser: mocks.browserColumn,
    country: mocks.countryColumn,
  },
}));
vi.mock("drizzle-orm", () => ({ eq: mocks.eq, desc: mocks.desc }));
vi.mock("logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));

import {
  computeSecurityFlags,
  getRecentSecurityEvents,
  recordSecurityEvent,
} from "./security-events";
import type { RequestMetadata } from "./types";

const metadata: RequestMetadata = {
  ip: "198.51.100.10",
  country: "US",
  city: "New York",
  device: "desktop",
  os: "Windows 10+",
  browser: "Chrome",
  userAgent: "Chrome",
  referer: "https://example.test",
  timestamp: "2026-11-09T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockResolvedValue({ securityEventsLookback: 12 });
  mocks.limit.mockResolvedValue([]);
  mocks.values.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.orderBy.mockReturnValue({ limit: mocks.limit });
  mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.select.mockReturnValue({ from: mocks.from });
});

describe("security event repository boundaries", () => {
  it("compares only the authenticated user's prior events with a bounded lookback", async () => {
    await computeSecurityFlags("owner-1", metadata);

    expect(mocks.eq).toHaveBeenCalledWith(mocks.userIdColumn, "owner-1");
    expect(mocks.where).toHaveBeenCalledWith({
      column: mocks.userIdColumn,
      value: "owner-1",
    });
    expect(mocks.limit).toHaveBeenCalledWith(12);
  });

  it("bounds personal event history and filters it by the requested owner", async () => {
    const rows = [{ id: "event-1", userId: "owner-2" }];
    mocks.limit.mockResolvedValue(rows);

    await expect(getRecentSecurityEvents("owner-2", 1000)).resolves.toBe(rows);
    expect(mocks.eq).toHaveBeenCalledWith(mocks.userIdColumn, "owner-2");
    expect(mocks.limit).toHaveBeenCalledWith(100);
  });

  it("sanitizes metadata before inserting and returns flags without blocking callers", async () => {
    const flags = await recordSecurityEvent("owner-3", "login", {
      ...metadata,
      ip: "raw invalid address",
      referer: "https://example.test/login?token=private",
    });

    expect(flags).toEqual({ isNewDevice: false, isNewLocation: false });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-3",
        eventType: "login",
        ip: "unknown",
        referer: "https://example.test",
      }),
    );
  });
});
