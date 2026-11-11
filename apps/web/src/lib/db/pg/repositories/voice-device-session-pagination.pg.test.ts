import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  join: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));

import { pgCustomVoiceDeviceRepository } from "./voice-device-custom-repository.pg";

const deviceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const cursor = {
  id: "00000000-0000-4000-8000-000000000003",
  startedAt: "2026-11-07T12:00:00.000123Z",
};

describe("voice device session pagination repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
    };
    for (const method of ["from", "innerJoin", "where", "orderBy"] as const)
      chain[method].mockImplementation((...args: unknown[]) => {
        if (method === "innerJoin") mocks.join(args[1]);
        if (method === "where") mocks.where(args[0]);
        return chain;
      });
    chain.limit.mockImplementation((limit: number) => {
      mocks.limit(limit);
      return Promise.resolve([]);
    });
    mocks.db.select.mockReturnValue(chain);
  });

  it("uses a precise stable cursor and keeps every page owner/device scoped", async () => {
    await pgCustomVoiceDeviceRepository.listRecentSessionsByDevice({
      deviceId,
      userId,
      limit: 21,
      cursor,
    });

    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('"voice_device_session"."device_id" =');
    expect(query.sql).toContain('"voice_device_session"."user_id" =');
    const ownerJoin = new PgDialect().sqlToQuery(mocks.join.mock.calls[0][0]);
    expect(ownerJoin.sql).toContain('"voice_device"."user_id" =');
    expect(ownerJoin.params).toContain(userId);
    expect(query.sql).toContain('"voice_device_session"."started_at" <');
    expect(query.sql).toContain('"voice_device_session"."started_at" =');
    expect(query.sql).toContain('"voice_device_session"."id" <');
    expect(query.params).toContain(deviceId);
    expect(query.params).toContain(userId);
    expect(query.params).toContain(cursor.startedAt);
    expect(query.params).toContain(cursor.id);
    expect(mocks.limit).toHaveBeenCalledWith(21);
  });

  it("caps repository pages at the API sentinel bound", async () => {
    await pgCustomVoiceDeviceRepository.listRecentSessionsByDevice({
      deviceId,
      userId,
      limit: 500,
    });
    expect(mocks.limit).toHaveBeenCalledWith(51);
  });
});
