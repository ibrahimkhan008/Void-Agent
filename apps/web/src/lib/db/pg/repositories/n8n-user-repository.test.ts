import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const insertChain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  return {
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    selectChain,
    insertChain,
    updateChain,
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    },
  };
});

vi.mock("drizzle-orm", () => ({ eq: mocks.eq }));
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("../schema.pg", () => ({
  N8nUserTable: {
    id: { name: "id" },
    userId: { name: "user_id" },
  },
}));

import { pgN8nUserRepository } from "./n8n-user-repository.pg";

// findByUserId fails closed when a row has no API key ("N8N API key is missing
// from the credential record") and N8nUserRecord.apiKey is required, so the
// record under test models a complete legacy-plaintext credential — not the
// empty placeholder provision.ts saves before n8n generates the real key.
const userRecord = {
  id: "row-1",
  userId: "user-1",
  n8nUserId: "n8n-1",
  apiKey: "api-key",
  email: "user@example.test",
  password: "secret",
};

describe("pgN8nUserRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.onConflictDoNothing.mockReturnValue(mocks.insertChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateChain);
    mocks.updateChain.where.mockResolvedValue([]);
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "01234567890123456789012345678901");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("looks up the n8n identity by the authenticated Void Agent user ID", async () => {
    mocks.selectChain.limit.mockResolvedValue([userRecord]);
    await expect(pgN8nUserRepository.findByUserId("user-1")).resolves.toEqual(
      userRecord,
    );
    expect(mocks.eq).toHaveBeenCalledWith({ name: "user_id" }, "user-1");
    expect(mocks.selectChain.limit).toHaveBeenCalledWith(1);
  });

  it("persists a new user mapping and returns the inserted record", async () => {
    mocks.insertChain.returning.mockImplementation(async () => [
      { ...userRecord, ...mocks.insertChain.values.mock.calls[0][0] },
    ]);
    await expect(
      pgN8nUserRepository.save({
        userId: "user-1",
        n8nUserId: "n8n-1",
        apiKey: "api-secret",
        email: "user@example.test",
        password: "secret",
      }),
    ).resolves.toEqual({ ...userRecord, apiKey: "api-secret" });
    const stored = mocks.insertChain.values.mock.calls[0][0];
    expect(stored.password).toMatch(/^enc:v1:/);
    expect(stored.password).not.toBe("secret");
    expect(stored.apiKey).toMatch(/^enc:v1:/);
    expect(stored.apiKey).not.toBe("api-secret");
    expect(mocks.insertChain.onConflictDoNothing).toHaveBeenCalledWith({
      target: { name: "user_id" },
    });
  });

  it("decrypts legacy plaintext for the caller and upgrades it at rest", async () => {
    mocks.selectChain.limit.mockResolvedValue([userRecord]);

    await expect(pgN8nUserRepository.findByUserId("user-1")).resolves.toEqual(
      userRecord,
    );
    const upgraded = mocks.updateChain.set.mock.calls[0][0];
    expect(upgraded.password).toMatch(/^enc:v1:/);
    expect(upgraded.password).not.toBe("secret");
  });

  it("fails closed on legacy credentials when encryption is unavailable", async () => {
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "");
    mocks.selectChain.limit.mockResolvedValue([userRecord]);

    await expect(pgN8nUserRepository.findByUserId("user-1")).rejects.toThrow(
      "ENCRYPTION_MASTER_KEY is required",
    );
    expect(mocks.updateChain.set).not.toHaveBeenCalled();
  });

  it("refuses to create credentials without the encryption key", async () => {
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "");
    await expect(
      pgN8nUserRepository.save({
        userId: "user-1",
        n8nUserId: "n8n-1",
        apiKey: "",
        password: "secret",
      }),
    ).rejects.toThrow("ENCRYPTION_MASTER_KEY is required");
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });
});
