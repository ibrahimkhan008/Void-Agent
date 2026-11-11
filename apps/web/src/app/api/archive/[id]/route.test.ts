import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnedArchive: vi.fn(),
  listOwnedArchiveThreads: vi.fn(),
  updateOwnedArchive: vi.fn(),
  deleteOwnedArchive: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request?: Request, context?: unknown) =>
      handler(
        request ??
          new NextRequest(
            "https://app.test/api/archive/00000000-0000-4000-8000-000000000001",
          ),
        { user: { id: "owner-1" } },
        context ?? {
          params: Promise.resolve({
            id: "00000000-0000-4000-8000-000000000001",
          }),
        },
      ),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("@/lib/archives/archive-service", () => ({
  getOwnedArchive: mocks.getOwnedArchive,
  listOwnedArchiveThreads: mocks.listOwnedArchiveThreads,
  updateOwnedArchive: mocks.updateOwnedArchive,
  deleteOwnedArchive: mocks.deleteOwnedArchive,
}));

import { DELETE, GET, PUT } from "./route";

const archiveId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id: archiveId }) };
const request = (method: string, body?: string, origin = "https://app.test") =>
  new NextRequest(`https://app.test/api/archive/${archiveId}`, {
    method,
    headers: {
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });

describe("/api/archive/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getOwnedArchive.mockResolvedValue({
      id: archiveId,
      userId: "owner-1",
      name: "Research",
    });
    mocks.listOwnedArchiveThreads.mockResolvedValue([]);
    mocks.updateOwnedArchive.mockResolvedValue({
      id: archiveId,
      userId: "owner-1",
      name: "Updated",
    });
    mocks.deleteOwnedArchive.mockResolvedValue(true);
  });

  it("returns 404 for archives outside the signed-in user's scope", async () => {
    mocks.getOwnedArchive.mockResolvedValue(null);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(404);
    expect(mocks.getOwnedArchive).toHaveBeenCalledWith(archiveId, "owner-1");
    expect(mocks.listOwnedArchiveThreads).not.toHaveBeenCalled();
  });

  it("returns only owned conversations and disables caching", async () => {
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.listOwnedArchiveThreads).toHaveBeenCalledWith(
      archiveId,
      "owner-1",
    );
  });

  it("requires same-origin, validated updates and scopes deletion to the owner", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (
        await PUT(
          request("PUT", '{"name":"new"}', "https://evil.test"),
          context,
        )
      ).status,
    ).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    expect((await PUT(request("PUT", "{}"), context)).status).toBe(400);
    const updated = await PUT(request("PUT", '{"name":"Updated"}'), context);
    expect(updated.status).toBe(200);
    expect(mocks.updateOwnedArchive).toHaveBeenCalledWith(
      archiveId,
      "owner-1",
      { name: "Updated" },
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    expect(mocks.deleteOwnedArchive).toHaveBeenCalledWith(archiveId, "owner-1");
  });
});
