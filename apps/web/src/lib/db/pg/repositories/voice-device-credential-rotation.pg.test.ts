import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { update: vi.fn() },
  hash: vi.fn(),
  where: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("lib/voice/device-token", () => ({
  generateVoiceDeviceToken: () => "nvdev_live_generated-token",
  hashVoiceDeviceSecret: mocks.hash,
}));

import { pgCustomVoiceDeviceRepository } from "./voice-device-custom-repository.pg";

const deviceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

describe("voice device credential rotation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockReturnValue("peppered-sha256-hash");
  });

  it("stores only a peppered hash and scopes rotation to the active owner row", async () => {
    const chain = {
      set: vi.fn(),
      where: vi.fn(),
      returning: vi
        .fn()
        .mockResolvedValue([{ id: deviceId, displayName: "Kitchen Echo" }]),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockImplementation((predicate: unknown) => {
      mocks.where(predicate);
      return chain;
    });
    mocks.db.update.mockReturnValue(chain);

    await expect(
      pgCustomVoiceDeviceRepository.rotateCredential(deviceId, userId),
    ).resolves.toEqual({
      device: { id: deviceId, displayName: "Kitchen Echo" },
      token: "nvdev_live_generated-token",
    });

    expect(mocks.hash).toHaveBeenCalledWith(
      "token",
      "nvdev_live_generated-token",
    );
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "peppered-sha256-hash" }),
    );
    const persisted = chain.set.mock.calls[0][0];
    expect(JSON.stringify(persisted)).not.toContain(
      "nvdev_live_generated-token",
    );

    const predicate = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(predicate.sql).toContain('"voice_device"."id" = $1');
    expect(predicate.sql).toContain('"voice_device"."user_id" = $2');
    expect(predicate.sql).toContain('"voice_device"."status" = $3');
    expect(predicate.params).toEqual([deviceId, userId, "active"]);
  });

  it("returns no token when the device is missing, revoked, or owned by another user", async () => {
    const chain = {
      set: vi.fn(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    chain.set.mockReturnValue(chain);
    mocks.db.update.mockReturnValue(chain);

    await expect(
      pgCustomVoiceDeviceRepository.rotateCredential(deviceId, userId),
    ).resolves.toBeNull();
  });
});
