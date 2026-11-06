import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCollectionAccess: vi.fn(),
  ingestFile: vi.fn(),
  ingestText: vi.fn(),
  ingestUrl: vi.fn(),
  enqueueProjectBrainForIngest: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("server-only", () => ({}));
vi.mock("lib/collections/access", () => ({
  getCollectionAccess: mocks.getCollectionAccess,
  canWriteCollection: (role: string) => role !== "viewer",
}));
vi.mock("lib/rag/ingest", () => ({
  ingestFile: mocks.ingestFile,
  ingestText: mocks.ingestText,
  ingestUrl: mocks.ingestUrl,
}));
vi.mock("lib/projects/brain-queue", () => ({
  enqueueProjectBrainForIngest: mocks.enqueueProjectBrainForIngest,
}));

import { POST } from "./route";

const collectionId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: collectionId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getCollectionAccess.mockResolvedValue({
    collection: { id: collectionId },
    role: "owner",
  });
  mocks.ingestText.mockResolvedValue({
    itemId: "item-1",
    documentId: "doc-1",
    chunks: 1,
  });
  mocks.enqueueProjectBrainForIngest.mockResolvedValue({
    queued: 1,
    capped: false,
  });
});

describe("POST /api/collections/[id]/items project brain trigger", () => {
  it("enqueues newly ingested text for attached projects", async () => {
    const response = await POST(
      new Request(`http://localhost/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          text: "The release goal is to launch in June.",
        }),
      }),
      params,
    );

    expect(response.status).toBe(201);
    expect(mocks.ingestText).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId, actorUserId: "user-1" }),
    );
    expect(await response.json()).toMatchObject({
      itemId: "item-1",
      projectBrainQueued: 1,
    });
    expect(mocks.enqueueProjectBrainForIngest).toHaveBeenCalledWith({
      userId: "user-1",
      collectionId,
      itemId: "item-1",
    });
  });

  it("does not let team viewers ingest into shared collections", async () => {
    mocks.getCollectionAccess.mockResolvedValueOnce({
      collection: { id: collectionId },
      role: "viewer",
    });
    const response = await POST(
      new Request(`http://localhost/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ text: "Must remain read-only." }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect(mocks.ingestText).not.toHaveBeenCalled();
  });

  it("keeps successful ingestion successful if optional brain enqueue fails", async () => {
    mocks.enqueueProjectBrainForIngest.mockRejectedValue(
      new Error("queue unavailable"),
    );
    const response = await POST(
      new Request(`http://localhost/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ text: "A persisted source." }),
      }),
      params,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      itemId: "item-1",
      projectBrainQueued: 0,
    });
  });
});
