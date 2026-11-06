import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCollectionById: vi.fn(),
  getTeamRole: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  collectionRepository: { getCollectionById: mocks.getCollectionById },
}));
vi.mock("lib/projects/access", () => ({ getTeamRole: mocks.getTeamRole }));

import {
  canAttachCollectionToProject,
  canDeleteCollection,
  canWriteCollection,
  getCollectionAccess,
} from "./access";

describe("team-shared collection access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps personal collections private to their owner", async () => {
    mocks.getCollectionById.mockResolvedValue({
      id: "c1",
      userId: "owner",
      orgId: null,
    });
    expect(await getCollectionAccess("c1", "owner")).toMatchObject({
      role: "owner",
    });
    expect(await getCollectionAccess("c1", "other")).toBeNull();
    expect(mocks.getTeamRole).not.toHaveBeenCalled();
  });

  it("requires current membership even when the collection creator requests team access", async () => {
    mocks.getCollectionById.mockResolvedValue({
      id: "c1",
      userId: "creator",
      orgId: "team-1",
    });
    mocks.getTeamRole
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("editor");
    expect(await getCollectionAccess("c1", "creator")).toBeNull();
    expect(await getCollectionAccess("c1", "member")).toMatchObject({
      role: "editor",
    });
  });

  it("keeps viewers read-only and confines shared collections to the same project team", () => {
    const viewer = {
      collection: { id: "shared", userId: "creator", orgId: "team-a" } as never,
      role: "viewer" as const,
    };
    expect(canWriteCollection(viewer.role)).toBe(false);
    expect(canDeleteCollection(viewer, "creator")).toBe(false);
    expect(canAttachCollectionToProject(viewer, "member", "team-a")).toBe(true);
    expect(canAttachCollectionToProject(viewer, "member", "team-b")).toBe(
      false,
    );
    expect(canAttachCollectionToProject(viewer, "member", null)).toBe(false);
  });
});
