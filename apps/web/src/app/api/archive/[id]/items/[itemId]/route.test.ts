import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  removeOwnedThreadFromArchive: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request?: Request, context?: unknown) =>
      handler(
        request ??
          new NextRequest(
            "https://app.test/api/archive/00000000-0000-4000-8000-000000000001/items/00000000-0000-4000-8000-000000000002",
          ),
        { user: { id: "owner-1" } },
        context ?? {
          params: Promise.resolve({
            id: "00000000-0000-4000-8000-000000000001",
            itemId: "00000000-0000-4000-8000-000000000002",
          }),
        },
      ),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("@/lib/archives/archive-service", () => ({
  removeOwnedThreadFromArchive: mocks.removeOwnedThreadFromArchive,
}));

import { DELETE } from "./route";

const archiveId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: archiveId, itemId }) };

describe("DELETE /api/archive/[id]/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.removeOwnedThreadFromArchive.mockResolvedValue(true);
  });

  it("removes only an owner-scoped archive membership", async () => {
    const request = new NextRequest(
      `https://app.test/api/archive/${archiveId}/items/${itemId}`,
      {
        method: "DELETE",
        headers: { origin: "https://app.test" },
      },
    );
    const response = await DELETE(request, context);
    expect(response.status).toBe(204);
    expect(mocks.removeOwnedThreadFromArchive).toHaveBeenCalledWith({
      archiveId,
      threadId: itemId,
      userId: "owner-1",
    });
  });

  it("rejects cross-origin and missing membership requests", async () => {
    const request = new NextRequest(
      `https://app.test/api/archive/${archiveId}/items/${itemId}`,
      {
        method: "DELETE",
        headers: { origin: "https://evil.test" },
      },
    );
    mocks.hasSameOrigin.mockReturnValue(false);
    expect((await DELETE(request, context)).status).toBe(403);
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.removeOwnedThreadFromArchive.mockResolvedValue(false);
    expect((await DELETE(request, context)).status).toBe(404);
  });
});
