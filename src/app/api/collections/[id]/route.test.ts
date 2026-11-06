import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  listItems: vi.fn(),
  count: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("@/app/api/chat/shared.chat", () => ({
  handleError: (error: unknown) => String(error),
}));
vi.mock("lib/db/repository", () => ({
  collectionRepository: {
    listAccessibleCollectionItems: mocks.listItems,
    countChunksForItems: mocks.count,
    deleteCollection: mocks.remove,
  },
}));
vi.mock("lib/collections/access", () => ({
  getCollectionAccess: mocks.access,
  canWriteCollection: (role: string) => role !== "viewer",
  canDeleteCollection: (
    access: { collection: { userId: string }; role: string },
    userId: string,
  ) => access.collection.userId === userId && access.role !== "viewer",
}));

import { DELETE, GET } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id }) };

describe("/api/collections/[id] team access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    mocks.access.mockResolvedValue({
      collection: { id, userId: "creator", orgId: "team" },
      role: "viewer",
    });
    mocks.listItems.mockResolvedValue([]);
    mocks.count.mockResolvedValue({});
  });

  it("allows a team viewer to read but identifies the access role", async () => {
    const response = await GET(
      new Request(`https://app.example/api/collections/${id}`),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      collection: { id },
      access: { role: "viewer", canWrite: false, canDelete: false },
    });
  });

  it("hides collections from nonmembers and blocks viewer deletion before database mutation", async () => {
    mocks.access.mockResolvedValueOnce(null);
    expect(
      (
        await GET(
          new Request(`https://app.example/api/collections/${id}`),
          params,
        )
      ).status,
    ).toBe(404);
    const response = await DELETE(
      new Request(`https://app.example/api/collections/${id}`, {
        method: "DELETE",
        headers: { Origin: "https://app.example" },
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
