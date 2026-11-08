import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectThread: vi.fn(),
  getProjectAccess: vi.fn(),
  listProjectsForUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  chatRepository: { selectThread: mocks.selectThread },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  listProjectsForUser: mocks.listProjectsForUser,
}));

import {
  getAccessibleProjectStatusScope,
  getOwnedProjectThreadScope,
} from "./project-status";

const userId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";

describe("owned voice project status scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectThread.mockResolvedValue({
      id: threadId,
      userId,
      projectId,
      collectionIds: ["collection-current", "collection-removed"],
    });
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: ["collection-current"] },
      role: "viewer",
    });
    mocks.listProjectsForUser.mockResolvedValue([
      { id: projectId, name: "Release" },
    ]);
  });

  it("derives scope from the user's thread and intersects current collections", async () => {
    await expect(getOwnedProjectThreadScope(userId, threadId)).resolves.toEqual(
      {
        projectId,
        collectionIds: ["collection-current"],
      },
    );
    expect(mocks.selectThread).toHaveBeenCalledWith(threadId);
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(projectId, userId);
  });

  it("rejects malformed, missing, foreign, and non-project threads", async () => {
    await expect(getOwnedProjectThreadScope(userId, "bad")).resolves.toBeNull();
    expect(mocks.selectThread).not.toHaveBeenCalled();

    mocks.selectThread.mockResolvedValueOnce(null);
    await expect(
      getOwnedProjectThreadScope(userId, threadId),
    ).resolves.toBeNull();
    mocks.selectThread.mockResolvedValueOnce({ id: threadId, userId: "other" });
    await expect(
      getOwnedProjectThreadScope(userId, threadId),
    ).resolves.toBeNull();
    mocks.selectThread.mockResolvedValueOnce({
      id: threadId,
      userId,
      projectId: null,
    });
    await expect(
      getOwnedProjectThreadScope(userId, threadId),
    ).resolves.toBeNull();
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
  });

  it("rejects a project after access is revoked", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    await expect(
      getOwnedProjectThreadScope(userId, threadId),
    ).resolves.toBeNull();
  });

  it("resolves an exact accessible project name and rechecks its ACL", async () => {
    await expect(
      getAccessibleProjectStatusScope(userId, { projectName: " release " }),
    ).resolves.toEqual({
      projectId,
      collectionIds: ["collection-current"],
    });
    expect(mocks.listProjectsForUser).toHaveBeenCalledWith(userId);
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(projectId, userId);
  });

  it("supports project IDs and rejects inaccessible or ambiguous names", async () => {
    await expect(
      getAccessibleProjectStatusScope(userId, { projectId }),
    ).resolves.toEqual({
      projectId,
      collectionIds: ["collection-current"],
    });
    expect(mocks.listProjectsForUser).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValueOnce(null);
    await expect(
      getAccessibleProjectStatusScope(userId, { projectId }),
    ).resolves.toBeNull();
    mocks.listProjectsForUser.mockResolvedValueOnce([
      { id: projectId, name: "Release" },
      { id: "other", name: "release" },
    ]);
    await expect(
      getAccessibleProjectStatusScope(userId, { projectName: "Release" }),
    ).resolves.toBeNull();
  });
});
