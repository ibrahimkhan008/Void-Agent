import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteOwnedCollectionItem: vi.fn(),
  sameOrigin: vi.fn(),
}));
vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (
      request: Request,
      context: { params: Promise<{ id: string; itemId: string }> },
    ) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/collections/collection-service", () => ({
  deleteOwnedCollectionItem: mocks.deleteOwnedCollectionItem,
}));

import { DELETE } from "./route";

describe("/api/collections/[id]/items/[itemId]", () => {
  const context = {
    params: Promise.resolve({ id: "collection-1", itemId: "doc-1" }),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.deleteOwnedCollectionItem.mockResolvedValue(true);
  });

  it("requires same-origin and owner-scoped item deletion", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (
        await DELETE(
          new NextRequest("https://app.test", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect(
      (
        await DELETE(
          new NextRequest("https://app.test", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(204);
    expect(mocks.deleteOwnedCollectionItem).toHaveBeenCalledWith({
      id: "collection-1",
      itemId: "doc-1",
      userId: "owner-1",
    });
  });

  it("does not reveal foreign or missing item identifiers", async () => {
    mocks.deleteOwnedCollectionItem.mockResolvedValue(false);
    const response = await DELETE(
      new NextRequest("https://app.test", { method: "DELETE" }),
      context,
    );
    expect(response.status).toBe(404);
  });
});
