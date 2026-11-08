import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  for (const method of [query.from, query.innerJoin, query.where]) {
    method.mockReturnValue(query);
  }
  return {
    query,
    pgDb: { select: vi.fn(() => query) },
    getProjectAccess: vi.fn(),
    getProjectCollectionSourceOwnerIds: vi.fn(),
  };
});

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: mocks.pgDb }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));

import { filterCurrentAgentsetProjectSources } from "./agentset-source-access";

describe("filterCurrentAgentsetProjectSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.from.mockReturnValue(mocks.query);
    mocks.query.innerJoin.mockReturnValue(mocks.query);
    mocks.query.where.mockReturnValue(mocks.query);
    mocks.query.limit.mockResolvedValue([
      {
        collectionId: "collection-a",
        itemId: "item-a",
        documentId: "doc-a",
        ownerUserId: "owner-a",
      },
    ]);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: "project-a", collectionIds: ["collection-a"] },
      role: "viewer",
    });
    mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-a"]);
  });

  it("retains only currently attached, ready documents with an allowed source owner", async () => {
    const allowed = {
      content: "safe source text",
      source: "brief.pdf",
      score: 0.8,
      metadata: {
        projectId: "project-a",
        collectionId: "collection-a",
        collectionItemId: "item-a",
        documentId: "doc-a",
        ownerUserId: "owner-a",
        sourceStatus: "ready",
      },
    };
    const hits = await filterCurrentAgentsetProjectSources({
      projectId: "project-a",
      userId: "member-a",
      hits: [
        allowed,
        {
          ...allowed,
          content: "foreign document",
          metadata: { ...allowed.metadata, documentId: "doc-foreign" },
        },
      ],
    });

    expect(mocks.getProjectAccess).toHaveBeenCalledWith(
      "project-a",
      "member-a",
    );
    expect(mocks.getProjectCollectionSourceOwnerIds).toHaveBeenCalledOnce();
    expect(mocks.query.limit).toHaveBeenCalledWith(8);
    expect(hits).toEqual([allowed]);
  });

  it("fails closed when project access or attached collections are absent", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    await expect(
      filterCurrentAgentsetProjectSources({
        projectId: "project-a",
        userId: "member-a",
        hits: [{ content: "x", source: "x", score: 0, metadata: {} }],
      }),
    ).resolves.toEqual([]);
    expect(mocks.pgDb.select).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValueOnce({
      project: { id: "project-a", collectionIds: [] },
      role: "owner",
    });
    await expect(
      filterCurrentAgentsetProjectSources({
        projectId: "project-a",
        userId: "owner-a",
        hits: [{ content: "x", source: "x", score: 0, metadata: {} }],
      }),
    ).resolves.toEqual([]);
  });
});
