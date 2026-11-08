import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionOwnerIds: vi.fn(),
  getActiveProjectBrainChatSourceOwnerIds: vi.fn(),
  hasSameOrigin: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, update: mocks.update },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionOwnerIds: mocks.getProjectCollectionOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/projects/project-chat-brain-source", () => ({
  getActiveProjectBrainChatSourceOwnerIds:
    mocks.getActiveProjectBrainChatSourceOwnerIds,
}));
vi.mock("lib/projects/brain-source-state", () => ({
  projectBrainRunIsActiveSourceRevision: vi.fn(() => true),
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));

import { PATCH } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const factId = "00000000-0000-4000-8000-000000000003";
const chatSourceId = "00000000-0000-4000-8000-000000000004";

describe("project-brain chat fact review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "editor",
      project: { collectionIds: [] },
    });
    mocks.getActiveProjectBrainChatSourceOwnerIds.mockResolvedValue([userId]);
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({ where: async () => [{ id: chatSourceId }] }),
      }),
    });
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [
            { id: factId, projectId, chatSourceId, reviewStatus: "accepted" },
          ],
        }),
      }),
    });
  });

  it("accepts a proposed fact only through its active owner-scoped chat source", async () => {
    const response = await PATCH(
      new Request(
        `https://void.test/api/projects/${projectId}/brain/facts/${factId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        },
      ),
      { params: Promise.resolve({ id: projectId, factId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      fact: { id: factId, chatSourceId, reviewStatus: "accepted" },
    });
    expect(mocks.getActiveProjectBrainChatSourceOwnerIds).toHaveBeenCalledWith(
      projectId,
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
