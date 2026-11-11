import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteOwnedCollection: vi.fn(),
  getOwnedCollection: vi.fn(),
  listOwnedCollectionItems: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: Request, context: { params: Promise<{ id: string }> }) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("@/lib/collections/collection-service", () => ({
  deleteOwnedCollection: mocks.deleteOwnedCollection,
  getOwnedCollection: mocks.getOwnedCollection,
  listOwnedCollectionItems: mocks.listOwnedCollectionItems,
  toCollectionShape: (row: unknown) => row,
}));

import { DELETE, GET } from "./route";

const context = { params: Promise.resolve({ id: "collection-1" }) };

describe("/api/collections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getOwnedCollection.mockResolvedValue({
      id: "collection-1",
      userId: "owner-1",
    });
    mocks.listOwnedCollectionItems.mockResolvedValue({
      items: [{ id: "doc-1" }],
      nextCursor: null,
    });
    mocks.deleteOwnedCollection.mockResolvedValue(true);
  });

  it("returns a private owner-only detail and item list", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/collections/collection-1"),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      collection: { id: "collection-1", userId: "owner-1" },
      items: [{ id: "doc-1" }],
      nextCursor: null,
    });
    expect(mocks.getOwnedCollection).toHaveBeenCalledWith(
      "collection-1",
      "owner-1",
    );
  });

  it("returns the same 404 for missing and foreign collection IDs", async () => {
    mocks.getOwnedCollection.mockResolvedValue(null);
    const response = await GET(
      new NextRequest("https://app.test/api/collections/other"),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.listOwnedCollectionItems).not.toHaveBeenCalled();
  });

  it("requires same-origin and performs owner-scoped deletion", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (
        await DELETE(
          new NextRequest("https://app.test", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    expect(
      (
        await DELETE(
          new NextRequest("https://app.test", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(204);
    expect(mocks.deleteOwnedCollection).toHaveBeenCalledWith(
      "collection-1",
      "owner-1",
    );
  });
});
