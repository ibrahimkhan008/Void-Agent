import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: { transaction: mocks.transaction } }));

import { pgDodoPaymentsRepository } from "./dodo-payments-repository.pg";

const eventTimestamp = new Date("2026-11-09T08:00:00.000Z");
const currentSubscription = {
  id: "db-id",
  userId: "user-1",
  dodoSubscriptionId: "sub-1",
  dodoCustomerId: "cus-1",
  dodoProductId: "product-pro",
  tier: "flare-pro",
  status: "cancelled",
  previousBillingDate: null,
  nextBillingDate: null,
  cancelAtNextBillingDate: true,
  cancelledAt: eventTimestamp,
  metadata: {},
  lastEventAt: new Date("2026-11-09T09:00:00.000Z"),
  createdAt: eventTimestamp,
  updatedAt: eventTimestamp,
};

describe("Dodo subscription event ordering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a strict provider-timestamp condition to activation upserts", async () => {
    const conflict = {
      returning: vi.fn().mockResolvedValue([currentSubscription]),
    };
    const onConflictDoUpdate = vi.fn(
      (_options: { setWhere?: unknown; set?: Record<string, unknown> }) =>
        conflict,
    );
    const values = { onConflictDoUpdate };
    const insert = { values: vi.fn(() => values) };
    const userWhere = vi.fn().mockResolvedValue([]);
    const userSet = { where: userWhere };
    const update = { set: vi.fn(() => userSet) };
    const tx = { insert: vi.fn(() => insert), update: vi.fn(() => update) };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await pgDodoPaymentsRepository.upsertSubscription({
      userId: "user-1",
      dodoSubscriptionId: "sub-1",
      dodoProductId: "product-pro",
      tier: "flare-pro",
      status: "active",
      eventTimestamp,
    });

    const options = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(options?.setWhere).toBeDefined();
    expect(options?.set?.lastEventAt).toEqual(eventTimestamp);
  });

  it("does not resync a tier when an activation is older than the stored cancellation", async () => {
    const conflict = { returning: vi.fn().mockResolvedValue([]) };
    const values = { onConflictDoUpdate: vi.fn(() => conflict) };
    const insert = { values: vi.fn(() => values) };
    const forUpdate = vi.fn().mockResolvedValue([currentSubscription]);
    const where = { for: forUpdate };
    const from = { where: vi.fn(() => where) };
    const tx = {
      insert: vi.fn(() => insert),
      select: vi.fn(() => ({ from: vi.fn(() => from) })),
      update: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await pgDodoPaymentsRepository.upsertSubscription({
      userId: "user-1",
      dodoSubscriptionId: "sub-1",
      dodoProductId: "product-pro",
      tier: "flare-pro",
      status: "active",
      eventTimestamp,
    });

    expect(result.status).toBe("cancelled");
    expect(tx.update).not.toHaveBeenCalled();
    expect(forUpdate).toHaveBeenCalledOnce();
  });

  it("conditions state updates on an event newer than the stored provider timestamp", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn((_condition: unknown) => ({ returning }));
    const set = { where };
    const tx = { update: vi.fn(() => ({ set: vi.fn(() => set) })) };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await pgDodoPaymentsRepository.updateSubscription({
      dodoSubscriptionId: "sub-1",
      status: "active",
      eventTimestamp,
    });

    expect(result).toBeNull();
    expect(where).toHaveBeenCalledOnce();
    expect(where.mock.calls[0]?.[0]).toBeDefined();
  });
});
