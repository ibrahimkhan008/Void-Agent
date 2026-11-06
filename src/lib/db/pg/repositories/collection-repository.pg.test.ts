import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: { update: mocks.update } }));

import { pgCollectionRepository } from "./collection-repository.pg";

describe("collection item freshness timestamps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("advances updatedAt whenever an item transitions status", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({ where });
    mocks.update.mockReturnValue({ set });

    const before = Date.now();
    await pgCollectionRepository.updateItemStatus("item-1", "ready");
    const after = Date.now();

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        error: null,
        updatedAt: expect.any(Date),
      }),
    );
    const [values] = set.mock.calls[0] as [{ updatedAt: Date }];
    expect(values.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(values.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("clears a private storage key when original bytes were rolled back", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({ where });
    mocks.update.mockReturnValue({ set });

    await pgCollectionRepository.updateItemStatus(
      "item-1",
      "failed",
      "embedding failed",
      true,
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", storageKey: null }),
    );
  });
});
