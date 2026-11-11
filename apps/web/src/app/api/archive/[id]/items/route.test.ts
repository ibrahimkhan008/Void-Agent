import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnedArchive: vi.fn(),
  listOwnedArchiveThreads: vi.fn(),
  addOwnedThreadToArchive: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request?: Request, context?: unknown) =>
      handler(
        request ??
          new NextRequest(
            "https://app.test/api/archive/00000000-0000-4000-8000-000000000001/items",
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
  addOwnedThreadToArchive: mocks.addOwnedThreadToArchive,
}));

import { GET, POST } from "./route";

const archiveId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: archiveId }) };
const post = (body: string, origin = "https://app.test") =>
  new NextRequest(`https://app.test/api/archive/${archiveId}/items`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body,
  });

describe("/api/archive/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getOwnedArchive.mockResolvedValue({
      id: archiveId,
      userId: "owner-1",
    });
    mocks.listOwnedArchiveThreads.mockResolvedValue([]);
    mocks.addOwnedThreadToArchive.mockResolvedValue({
      id: "ai1",
      archiveId,
      itemId: threadId,
    });
  });

  it("lists only a caller-owned archive", async () => {
    const response = await GET(
      new NextRequest(`https://app.test/api/archive/${archiveId}/items`),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.getOwnedArchive).toHaveBeenCalledWith(archiveId, "owner-1");
    expect(mocks.listOwnedArchiveThreads).toHaveBeenCalledWith(
      archiveId,
      "owner-1",
    );
  });

  it("rejects cross-origin and invalid thread IDs before persistence", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    expect(
      (
        await POST(
          post(JSON.stringify({ itemId: threadId }), "https://evil.test"),
          context,
        )
      ).status,
    ).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    expect((await POST(post('{"itemId":"not-a-uuid"}'), context)).status).toBe(
      400,
    );
    expect(mocks.addOwnedThreadToArchive).not.toHaveBeenCalled();
  });

  it("scopes the insertion to the signed-in user and rejects foreign conversations", async () => {
    const response = await POST(
      post(JSON.stringify({ itemId: threadId })),
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.addOwnedThreadToArchive).toHaveBeenCalledWith({
      archiveId,
      threadId,
      userId: "owner-1",
    });
    mocks.addOwnedThreadToArchive.mockResolvedValue(null);
    expect(
      (await POST(post(JSON.stringify({ itemId: threadId })), context)).status,
    ).toBe(404);
  });
});
