import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOwnedArchives: vi.fn(),
  createOwnedArchive: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request?: Request) =>
    handler(request ?? new NextRequest("https://app.test/api/archive"), {
      user: { id: "owner-1" },
    }),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("@/lib/archives/archive-service", () => ({
  listOwnedArchives: mocks.listOwnedArchives,
  createOwnedArchive: mocks.createOwnedArchive,
}));

import { GET, POST } from "./route";

const post = (body: string, origin = "https://app.test") =>
  new NextRequest("https://app.test/api/archive", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body,
  });

describe("/api/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.listOwnedArchives.mockResolvedValue([
      { id: "a1", userId: "owner-1", itemCount: 1 },
    ]);
    mocks.createOwnedArchive.mockImplementation(async (input) => ({
      id: "a2",
      ...input,
    }));
  });

  it("lists only through the current user's archive scope", async () => {
    const response = await GET(new NextRequest("https://app.test/api/archive"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      archives: [{ id: "a1", userId: "owner-1", itemCount: 1 }],
    });
    expect(mocks.listOwnedArchives).toHaveBeenCalledWith("owner-1");
  });

  it("creates validated, owner-scoped archives", async () => {
    const response = await POST(
      post(JSON.stringify({ name: "  Research  ", description: " refs " })),
    );
    expect(response.status).toBe(201);
    expect(mocks.createOwnedArchive).toHaveBeenCalledWith({
      userId: "owner-1",
      name: "Research",
      description: "refs",
    });
  });

  it("rejects cross-origin, malformed and extra-field payloads", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (await POST(post('{"name":"ok"}', "https://evil.test"))).status,
    ).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    expect((await POST(post("not-json"))).status).toBe(400);
    expect(
      (await POST(post(JSON.stringify({ name: "ok", userId: "other" }))))
        .status,
    ).toBe(400);
    expect(mocks.createOwnedArchive).not.toHaveBeenCalled();
  });
});
