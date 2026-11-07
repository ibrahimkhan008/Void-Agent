import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasSameOrigin: vi.fn(),
  getCollectionAccess: vi.fn(),
  canWriteCollection: vi.fn(),
  deleteCollectionItem: vi.fn(),
  processFileCleanupOutbox: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/collections/access", () => ({
  getCollectionAccess: mocks.getCollectionAccess,
  canWriteCollection: mocks.canWriteCollection,
}));
vi.mock("lib/db/repository", () => ({
  collectionRepository: { deleteCollectionItem: mocks.deleteCollectionItem },
}));
vi.mock("lib/file-storage/cleanup-outbox", () => ({
  processFileCleanupOutbox: mocks.processFileCleanupOutbox,
}));

import { DELETE } from "./route";

const params = {
  params: Promise.resolve({ id: "collection-1", itemId: "item-1" }),
};

describe("DELETE /api/collections/[id]/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getCollectionAccess.mockResolvedValue({ role: "owner" });
    mocks.canWriteCollection.mockReturnValue(true);
    mocks.deleteCollectionItem.mockResolvedValue({ status: "deleted" });
    mocks.processFileCleanupOutbox.mockResolvedValue({
      completed: 1,
      failed: 0,
      errors: [],
    });
  });

  it("requires authentication before attempting deletion", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(401);
    expect(mocks.deleteCollectionItem).not.toHaveBeenCalled();
  });

  it("rejects cross-origin delete requests", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.deleteCollectionItem).not.toHaveBeenCalled();
  });

  it("denies a caller who cannot write the collection", async () => {
    mocks.canWriteCollection.mockReturnValue(false);
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(403);
    expect(mocks.deleteCollectionItem).not.toHaveBeenCalled();
  });

  it("refuses a file that is referenced by projects or other workflows", async () => {
    mocks.deleteCollectionItem.mockResolvedValue({ status: "referenced" });
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(409);
    expect(mocks.processFileCleanupOutbox).not.toHaveBeenCalled();
  });

  it("refuses an unowned or multiply attached storage object", async () => {
    mocks.deleteCollectionItem.mockResolvedValue({ status: "shared-object" });
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(409);
    expect(mocks.processFileCleanupOutbox).not.toHaveBeenCalled();
  });

  it("reports object cleanup failures as pending instead of claiming completion", async () => {
    mocks.deleteCollectionItem.mockResolvedValue({
      status: "queued",
      outboxId: "outbox-1",
    });
    mocks.processFileCleanupOutbox.mockResolvedValue({
      completed: 0,
      failed: 1,
      errors: ["storage unavailable"],
    });
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      deleted: true,
      storageCleanup: "pending",
    });
  });

  it("returns success only after the outbox worker confirms object cleanup", async () => {
    mocks.deleteCollectionItem.mockResolvedValue({
      status: "queued",
      outboxId: "outbox-1",
    });
    const response = await DELETE(new Request("http://localhost"), params);
    expect(response.status).toBe(204);
    expect(mocks.deleteCollectionItem).toHaveBeenCalledWith(
      "item-1",
      "collection-1",
      "user-1",
    );
    expect(mocks.processFileCleanupOutbox).toHaveBeenCalledWith("outbox-1");
  });
});
