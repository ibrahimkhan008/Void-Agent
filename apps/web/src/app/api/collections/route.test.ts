import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOwnedCollection: vi.fn(),
  listOwnedCollections: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request?: Request) =>
    handler(request ?? new NextRequest("https://app.test/api/collections"), {
      user: { id: "user-1" },
    }),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("@/lib/collections/collection-service", () => ({
  createOwnedCollection: mocks.createOwnedCollection,
  listOwnedCollections: mocks.listOwnedCollections,
  toCollectionShape: (row: unknown) => row,
}));

import { GET, POST } from "./route";

const request = (body: string, origin = "https://app.test") =>
  new NextRequest("https://app.test/api/collections", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body,
  });

describe("/api/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.listOwnedCollections.mockResolvedValue([
      { id: "c1", userId: "user-1" },
    ]);
    mocks.createOwnedCollection.mockResolvedValue({
      id: "c2",
      userId: "user-1",
    });
  });

  it("lists only the authenticated user's collections through the service", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/collections"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      collections: [{ id: "c1", userId: "user-1" }],
    });
    expect(mocks.listOwnedCollections).toHaveBeenCalledWith("user-1");
  });

  it("creates a private collection after same-origin and strict body validation", async () => {
    const response = await POST(
      request(JSON.stringify({ name: "  Research  ", description: "notes" })),
    );
    expect(response.status).toBe(201);
    expect(mocks.createOwnedCollection).toHaveBeenCalledWith({
      name: "Research",
      description: "notes",
      userId: "user-1",
    });
  });

  it("rejects cross-origin, malformed, and extra-field writes before persistence", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (await POST(request('{"name":"x"}', "https://evil.test"))).status,
    ).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    expect((await POST(request("not-json"))).status).toBe(400);
    expect(
      (
        await POST(
          request(JSON.stringify({ name: "x", organizationId: "other" })),
        )
      ).status,
    ).toBe(400);
    expect(mocks.createOwnedCollection).not.toHaveBeenCalled();
  });
});
