import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCollectionAccess: vi.fn(),
  createCollectionItem: vi.fn(),
  createDocument: vi.fn(),
  insertDocumentChunks: vi.fn(),
  updateItemStatus: vi.fn(),
  embedBatch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/collections/access", () => ({
  getCollectionAccess: mocks.getCollectionAccess,
  canWriteCollection: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/repository", () => ({
  collectionRepository: {
    createCollectionItem: mocks.createCollectionItem,
    createDocument: mocks.createDocument,
    insertDocumentChunks: mocks.insertDocumentChunks,
    updateItemStatus: mocks.updateItemStatus,
  },
}));
vi.mock("lib/ai/memory/embed", () => ({ embedBatch: mocks.embedBatch }));
vi.mock("logger", () => ({ default: { info: vi.fn(), error: vi.fn() } }));

import { IngestError, ingestText } from "./ingest";

describe("ingestText write authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollectionAccess.mockResolvedValue({ role: "owner" });
    mocks.createCollectionItem.mockResolvedValue({ id: "item-created" });
    mocks.createDocument.mockResolvedValue({ id: "document-created" });
    mocks.insertDocumentChunks.mockResolvedValue(1);
    mocks.updateItemStatus.mockResolvedValue(undefined);
  });

  it("rechecks membership after upstream parsing and refuses a revoked writer", async () => {
    mocks.getCollectionAccess.mockResolvedValue(null);
    await expect(
      ingestText({
        collectionId: "collection-1",
        actorUserId: "former-member",
        text: "Private team notes",
      }),
    ).rejects.toThrow("Collection access is no longer available");
    expect(mocks.getCollectionAccess).toHaveBeenCalledWith(
      "collection-1",
      "former-member",
    );
    expect(mocks.createCollectionItem).not.toHaveBeenCalled();
  });

  it("preserves the created item id on post-create failures so callers can roll back", async () => {
    mocks.embedBatch.mockRejectedValue(new Error("embedding unavailable"));

    await expect(
      ingestText({
        collectionId: "collection-1",
        actorUserId: "owner-1",
        text: "A short project document.",
        storageKey: "uploads/owner-1/private.txt",
      }),
    ).rejects.toMatchObject({
      name: IngestError.name,
      collectionItemId: "item-created",
      message: "embedding unavailable",
    });
    expect(mocks.updateItemStatus).toHaveBeenCalledWith(
      "item-created",
      "failed",
      "embedding unavailable",
      true,
    );
  });
});
